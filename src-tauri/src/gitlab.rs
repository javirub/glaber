use crate::models::{GitLabInstance, GitLabVariable, PackageUploadParams};
use anyhow::{Context, Result};
use reqwest::{blocking::Body, blocking::Client, blocking::Response, header};
use std::fs::File;

/// GitLab caps `per_page` at 100 for the REST API.
const PER_PAGE: u32 = 100;

/// Stop after this many pages so a server that ignores `page` cannot hang the app.
const MAX_PAGES: u32 = 1_000;

pub struct GitLabClient {
    client: Client,
    instance: GitLabInstance,
}

impl GitLabClient {
    pub fn new(instance: GitLabInstance) -> Result<Self> {
        let mut headers = header::HeaderMap::new();
        let token = instance.token.trim();

        let mut auth_value = header::HeaderValue::from_str(token)
            .context("Invalid token format")?;
        auth_value.set_sensitive(true);
        headers.insert("PRIVATE-TOKEN", auth_value);

        let mut bearer_value = header::HeaderValue::from_str(&format!("Bearer {}", token))
            .context("Invalid bearer token format")?;
        // Keep the credential out of any header dump reqwest may log
        bearer_value.set_sensitive(true);
        headers.insert(header::AUTHORIZATION, bearer_value);

        let client = Client::builder()
            .default_headers(headers)
            .build()?;

        Ok(Self { client, instance })
    }

    fn base_url(&self) -> String {
        self.instance.url.trim().trim_end_matches('/').to_string()
    }

    fn encode_project_id(&self, project_id: &str) -> String {
        urlencoding::encode(project_id).to_string()
    }

    /// Turn a non-2xx response into an error carrying the status and body.
    fn fail(context: &str, response: Response) -> anyhow::Error {
        let status = response.status();
        let text = response.text().unwrap_or_default();
        anyhow::anyhow!("{}: {} - {}", context, status, text)
    }

    /// Fetch every page of a paginated list endpoint.
    ///
    /// GitLab returns only 20 records per page by default, so a single request
    /// silently truncated projects and CI/CD variables.
    ///
    /// Paging never assumes the server honoured the `per_page` we asked for: an
    /// instance or a reverse proxy may cap it at its own page size. When
    /// `x-next-page` is present it is authoritative; otherwise we keep asking
    /// for pages until one comes back empty, which is correct for any page size.
    fn get_all_pages(&self, url: &str, context: &str) -> Result<Vec<serde_json::Value>> {
        let separator = if url.contains('?') { '&' } else { '?' };
        let mut all = Vec::new();
        let mut previous: Option<Vec<serde_json::Value>> = None;
        let mut page = 1u32;

        while page <= MAX_PAGES {
            let paged_url = format!("{}{}per_page={}&page={}", url, separator, PER_PAGE, page);
            let response = self.client.get(&paged_url).send()?;

            if !response.status().is_success() {
                return Err(Self::fail(context, response));
            }

            // `None` means the header is absent, which some proxied instances do;
            // `Some(None)` means it is present but empty, which is GitLab's way of
            // saying this was the last page.
            let next_page = response
                .headers()
                .get("x-next-page")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.trim().parse::<u32>().ok());

            let items: Vec<serde_json::Value> = response
                .json()
                .with_context(|| format!("{}: unexpected response body on page {}", context, page))?;

            if items.is_empty() {
                break;
            }

            // A server that ignores `page` would otherwise loop forever
            if previous.as_ref() == Some(&items) {
                break;
            }

            all.extend(items.iter().cloned());
            previous = Some(items);

            match next_page {
                Some(Some(next)) if next > page => page = next,
                // The header is authoritative: this was the last page
                Some(_) => break,
                // No header: probe until a page comes back empty
                None => page += 1,
            }
        }

        Ok(all)
    }

    pub fn upload_package_file(&self, params: PackageUploadParams) -> Result<String> {
        let project_id_encoded = self.encode_project_id(&params.project_id);

        let url = format!(
            "{}/api/v4/projects/{}/packages/generic/{}/{}/{}",
            self.base_url(),
            project_id_encoded,
            urlencoding::encode(&params.package_name),
            urlencoding::encode(&params.package_version),
            urlencoding::encode(&params.file_name)
        );

        // Stream the file instead of loading it fully into memory: package
        // artifacts can be hundreds of megabytes.
        let file = File::open(&params.file_path)
            .with_context(|| format!("Failed to read file at {}", params.file_path))?;
        let len = file
            .metadata()
            .with_context(|| format!("Failed to stat file at {}", params.file_path))?
            .len();

        let response = self
            .client
            .put(&url)
            .body(Body::sized(file, len))
            .send()?;

        if response.status().is_success() {
            Ok(format!("Successfully uploaded {} to {}", params.file_name, url))
        } else {
            Err(Self::fail("Failed to upload package", response))
        }
    }

    pub fn search_projects(&self, query: Option<String>) -> Result<Vec<crate::models::GitLabProject>> {
        let mut url = format!("{}/api/v4/projects?membership=true&simple=true", self.base_url());
        if let Some(q) = query {
            url.push_str(&format!("&search={}", urlencoding::encode(&q)));
        }

        let projects = self.get_all_pages(&url, "Failed to search projects")?;

        Ok(projects
            .into_iter()
            .map(|p| crate::models::GitLabProject {
                id: String::new(),
                instance_id: self.instance.id.clone(),
                project_id: json_id(&p["id"]),
                name: p["name_with_namespace"].as_str().unwrap_or_default().to_string(),
            })
            .collect())
    }

    pub fn list_variables(&self, project_id: &str) -> Result<Vec<GitLabVariable>> {
        let encoded = self.encode_project_id(project_id);
        let url = format!("{}/api/v4/projects/{}/variables", self.base_url(), encoded);

        let vars = self.get_all_pages(&url, "Failed to list variables")?;
        Ok(vars.iter().map(variable_from_json).collect())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_variable(&self, project_id: &str, key: &str, value: &str, variable_type: &str, protected: bool, masked: bool, environment_scope: &str, description: &str) -> Result<GitLabVariable> {
        let encoded = self.encode_project_id(project_id);
        let url = format!("{}/api/v4/projects/{}/variables", self.base_url(), encoded);

        let body = serde_json::json!({
            "key": key,
            "value": value,
            "variable_type": variable_type,
            "protected": protected,
            "masked": masked,
            "environment_scope": environment_scope,
            "description": description,
        });

        let response = self.client.post(&url).json(&body).send()?;

        if response.status().is_success() {
            Ok(variable_from_json(&response.json()?))
        } else {
            Err(Self::fail("Failed to create variable", response))
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_variable(&self, project_id: &str, key: &str, value: &str, variable_type: &str, protected: bool, masked: bool, environment_scope: &str, description: &str) -> Result<GitLabVariable> {
        let url = self.variable_url(project_id, key, environment_scope);

        let body = serde_json::json!({
            "value": value,
            "variable_type": variable_type,
            "protected": protected,
            "masked": masked,
            "environment_scope": environment_scope,
            "description": description,
        });

        let response = self.client.put(&url).json(&body).send()?;

        if response.status().is_success() {
            Ok(variable_from_json(&response.json()?))
        } else {
            Err(Self::fail("Failed to update variable", response))
        }
    }

    pub fn delete_variable(&self, project_id: &str, key: &str, environment_scope: &str) -> Result<()> {
        let url = self.variable_url(project_id, key, environment_scope);

        let response = self.client.delete(&url).send()?;

        if response.status().is_success() {
            Ok(())
        } else {
            Err(Self::fail("Failed to delete variable", response))
        }
    }

    /// URL of a single variable, scoped to an environment when it is not `*`.
    fn variable_url(&self, project_id: &str, key: &str, environment_scope: &str) -> String {
        let encoded = self.encode_project_id(project_id);
        let key_encoded = urlencoding::encode(key);
        let mut url = format!("{}/api/v4/projects/{}/variables/{}", self.base_url(), encoded, key_encoded);

        if environment_scope != "*" {
            url.push_str(&format!(
                "?filter[environment_scope]={}",
                urlencoding::encode(environment_scope)
            ));
        }

        url
    }
}

/// Read a GitLab id, which the API sends as a number but may appear as a string.
fn json_id(value: &serde_json::Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.as_i64().map(|n| n.to_string()))
        .unwrap_or_default()
}

fn variable_from_json(v: &serde_json::Value) -> GitLabVariable {
    GitLabVariable {
        key: v["key"].as_str().unwrap_or_default().to_string(),
        value: v["value"].as_str().unwrap_or_default().to_string(),
        variable_type: v["variable_type"].as_str().unwrap_or("env_var").to_string(),
        protected: v["protected"].as_bool().unwrap_or(false),
        masked: v["masked"].as_bool().unwrap_or(false),
        environment_scope: v["environment_scope"].as_str().unwrap_or("*").to_string(),
        description: v["description"].as_str().unwrap_or_default().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::thread;

    fn instance() -> GitLabInstance {
        instance_at("https://gitlab.example.com/")
    }

    fn instance_at(url: &str) -> GitLabInstance {
        GitLabInstance {
            id: "i1".into(),
            name: "test".into(),
            url: url.into(),
            username: "javirub".into(),
            token: "glpat-secret".into(),
        }
    }

    /// A deliberately misbehaving GitLab, to pin down how the paginator copes.
    #[derive(Clone, Copy)]
    struct FakeGitLab {
        total: usize,
        /// What the server really serves per page, whatever `per_page` asked for.
        server_page_size: usize,
        send_next_page: bool,
        /// Always serve page 1, as a broken reverse proxy would.
        ignore_page_param: bool,
        status: u16,
    }

    impl Default for FakeGitLab {
        fn default() -> Self {
            Self {
                total: 0,
                server_page_size: 100,
                send_next_page: true,
                ignore_page_param: false,
                status: 200,
            }
        }
    }

    /// Read a numeric query parameter out of an HTTP request line.
    fn query_param(request_line: &str, key: &str) -> Option<u32> {
        let target = request_line.split_whitespace().nth(1)?;
        let (_, query) = target.split_once('?')?;
        query
            .split('&')
            .filter_map(|pair| pair.split_once('='))
            .find(|(k, _)| *k == key)
            .and_then(|(_, v)| v.parse().ok())
    }

    fn render(cfg: FakeGitLab, page: u32) -> String {
        if cfg.status != 200 {
            let body = r#"{"message":"boom"}"#;
            return format!(
                "HTTP/1.1 {} Error\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                cfg.status,
                body.len(),
                body
            );
        }

        let start = (page as usize - 1) * cfg.server_page_size;
        let end = (start + cfg.server_page_size).min(cfg.total);
        let items: Vec<serde_json::Value> = if start >= cfg.total {
            Vec::new()
        } else {
            (start..end)
                .map(|i| serde_json::json!({ "key": format!("K{}", i), "value": "v" }))
                .collect()
        };
        let body = serde_json::to_string(&items).unwrap();

        let mut headers = String::new();
        if cfg.send_next_page {
            // GitLab sends the header with an empty value on the last page
            let next = if end < cfg.total {
                (page + 1).to_string()
            } else {
                String::new()
            };
            headers.push_str(&format!("x-next-page: {}\r\n", next));
        }

        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}",
            headers,
            body.len(),
            body
        )
    }

    /// Returns the base URL of the fake server and a counter of served requests.
    fn spawn_fake(cfg: FakeGitLab) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&requests);

        // Detached: the thread dies with the test process.
        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { break };
                let Ok(peek) = stream.try_clone() else { continue };
                let mut reader = BufReader::new(peek);

                let mut request_line = String::new();
                if reader.read_line(&mut request_line).is_err() {
                    continue;
                }
                // The request headers must be drained or the client sees a reset
                loop {
                    let mut line = String::new();
                    match reader.read_line(&mut line) {
                        Ok(0) => break,
                        Ok(_) if line == "\r\n" || line == "\n" => break,
                        Ok(_) => {}
                        Err(_) => break,
                    }
                }
                counter.fetch_add(1, Ordering::SeqCst);

                let page = if cfg.ignore_page_param {
                    1
                } else {
                    query_param(&request_line, "page").unwrap_or(1)
                };

                let _ = stream.write_all(render(cfg, page).as_bytes());
                let _ = stream.flush();
            }
        });

        (format!("http://127.0.0.1:{}", port), requests)
    }

    fn list_from(cfg: FakeGitLab) -> (Result<Vec<GitLabVariable>>, usize) {
        let (url, requests) = spawn_fake(cfg);
        let client = GitLabClient::new(instance_at(&url)).unwrap();
        let result = client.list_variables("7");
        let served = requests.load(Ordering::SeqCst);
        (result, served)
    }

    #[test]
    fn paginates_using_the_next_page_header() {
        let (vars, requests) = list_from(FakeGitLab {
            total: 250,
            ..FakeGitLab::default()
        });
        let vars = vars.unwrap();
        assert_eq!(vars.len(), 250);
        assert_eq!(vars[0].key, "K0");
        assert_eq!(vars[249].key, "K249");
        assert_eq!(requests, 3);
    }

    #[test]
    fn paginates_without_the_next_page_header() {
        let (vars, requests) = list_from(FakeGitLab {
            total: 250,
            send_next_page: false,
            ..FakeGitLab::default()
        });
        assert_eq!(vars.unwrap().len(), 250);
        // One extra request: the empty page is what ends the loop
        assert_eq!(requests, 4);
    }

    #[test]
    fn collects_everything_when_the_server_caps_per_page() {
        // The regression: asking for 100 but being served 20 used to stop at 20.
        let (vars, requests) = list_from(FakeGitLab {
            total: 45,
            server_page_size: 20,
            send_next_page: false,
            ..FakeGitLab::default()
        });
        assert_eq!(vars.unwrap().len(), 45);
        assert_eq!(requests, 4);
    }

    #[test]
    fn stops_after_a_single_short_page() {
        let (vars, requests) = list_from(FakeGitLab {
            total: 7,
            send_next_page: false,
            ..FakeGitLab::default()
        });
        assert_eq!(vars.unwrap().len(), 7);
        assert_eq!(requests, 2);
    }

    #[test]
    fn empty_list_returns_no_variables() {
        let (vars, requests) = list_from(FakeGitLab::default());
        assert!(vars.unwrap().is_empty());
        assert_eq!(requests, 1);
    }

    #[test]
    fn terminates_when_the_server_ignores_the_page_parameter() {
        let (vars, requests) = list_from(FakeGitLab {
            total: 500,
            server_page_size: 20,
            ignore_page_param: true,
            ..FakeGitLab::default()
        });
        let vars = vars.unwrap();
        // The repeated page is dropped instead of being appended forever
        assert_eq!(vars.len(), 20);
        assert_eq!(requests, 2);
    }

    #[test]
    fn propagates_http_errors() {
        let (vars, requests) = list_from(FakeGitLab {
            status: 500,
            ..FakeGitLab::default()
        });
        let message = vars.unwrap_err().to_string();
        assert!(message.contains("500"), "{}", message);
        assert!(message.contains("Failed to list variables"), "{}", message);
        assert_eq!(requests, 1);
    }

    #[test]
    fn base_url_strips_trailing_slash() {
        let client = GitLabClient::new(instance()).unwrap();
        assert_eq!(client.base_url(), "https://gitlab.example.com");
    }

    #[test]
    fn variable_url_omits_filter_for_the_wildcard_scope() {
        let client = GitLabClient::new(instance()).unwrap();
        assert_eq!(
            client.variable_url("group/proj", "MY_KEY", "*"),
            "https://gitlab.example.com/api/v4/projects/group%2Fproj/variables/MY_KEY"
        );
    }

    #[test]
    fn variable_url_encodes_the_environment_scope() {
        let client = GitLabClient::new(instance()).unwrap();
        assert_eq!(
            client.variable_url("7", "MY_KEY", "review/*"),
            "https://gitlab.example.com/api/v4/projects/7/variables/MY_KEY\
             ?filter[environment_scope]=review%2F%2A"
        );
    }

    #[test]
    fn json_id_accepts_numbers_and_strings() {
        assert_eq!(json_id(&serde_json::json!(42)), "42");
        assert_eq!(json_id(&serde_json::json!("42")), "42");
        assert_eq!(json_id(&serde_json::Value::Null), "");
    }

    #[test]
    fn variable_from_json_falls_back_to_gitlab_defaults() {
        let v = variable_from_json(&serde_json::json!({ "key": "K", "value": "V" }));
        assert_eq!(v.key, "K");
        assert_eq!(v.value, "V");
        assert_eq!(v.variable_type, "env_var");
        assert_eq!(v.environment_scope, "*");
        assert!(!v.protected);
        assert!(!v.masked);
    }
}
