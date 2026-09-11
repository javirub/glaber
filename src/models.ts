export interface GitLabInstance {
  id: string;
  name: string;
  url: string;
  username: string;
  token: string;
}

export interface GitLabProject {
  id: string;
  instance_id: string;
  project_id: string;
  name: string;
}

export interface PackageUploadParams {
  project_id: string;
  instance_id: string;
  package_name: string;
  package_version: string;
  file_name: string;
  file_path: string;
}

// Environment Variables
export interface GitLabVariable {
  key: string;
  value: string;
  variable_type: string;
  protected: boolean;
  masked: boolean;
  environment_scope: string;
  description: string;
}

export interface CreateVariableParams {
  instance_id: string;
  project_id: string;
  key: string;
  value: string;
  variable_type: string;
  protected: boolean;
  masked: boolean;
  environment_scope: string;
  description: string;
}

export interface UpdateVariableParams {
  instance_id: string;
  project_id: string;
  key: string;
  value: string;
  variable_type: string;
  protected: boolean;
  masked: boolean;
  environment_scope: string;
  description: string;
}

export interface DeleteVariableParams {
  instance_id: string;
  project_id: string;
  key: string;
  environment_scope: string;
}

export type EnvVarStatus = "existing" | "new" | "edited" | "deleted";

export interface EnvVarRowSnapshot {
  key: string;
  value: string;
  variable_type: string;
  protected: boolean;
  masked: boolean;
  environment_scope: string;
  description: string;
}

export interface EnvVarRow {
  rowId: string;
  key: string;
  value: string;
  variable_type: string;
  protected: boolean;
  masked: boolean;
  environment_scope: string;
  description: string;
  status: EnvVarStatus;
  originalKey: string;
  isMaskedOnServer: boolean;
  errors: string[];
  originalSnapshot: EnvVarRowSnapshot | null;
}

export interface SaveError {
  type: "create" | "update" | "delete";
  key: string;
  error: string;
}

export interface ImportProtection {
  protected: boolean;
  masked: boolean;
}

export interface ImportResult {
  imported: number;
  merged: number;
}

export type ImportPreset = "unprotected" | "protected" | "protected_masked";

export type View = "actions" | "instances" | "projects" | "registry-upload" | "env-vars";

export type EnvVarInputMode = "manual" | "file" | "base64";

export type EnvVarType = "env_var" | "file";

/** What the Rust `read_file_base64` command returns. */
export interface FileBase64 {
  file_name: string;
  byte_size: number;
  base64: string;
}

/** A variable built from a Base64-encoded file, before it becomes a table row. */
export interface Base64RowDraft {
  key: string;
  value: string;
  variable_type: EnvVarType;
  protected: boolean;
  masked: boolean;
  description: string;
}
