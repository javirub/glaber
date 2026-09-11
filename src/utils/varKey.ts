/** GitLab keys may only contain letters, digits and underscores, up to 255 chars. */
export const GITLAB_MAX_KEY_LENGTH = 255;

export const BASE64_KEY_SUFFIX = "_BASE64";

/**
 * A sensible default variable key for a file, e.g. `my-cert.p12` becomes
 * `MY_CERT_P12_BASE64`. Always editable afterwards — this is only a suggestion.
 */
export function fileNameToVarKey(fileName: string): string {
  // The native dialog hands back Windows paths, so split on both separators
  const baseName = fileName.split(/[\\/]/).pop() ?? "";

  let stem = baseName
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (stem.length === 0) {
    stem = "FILE";
  }
  if (/^[0-9]/.test(stem)) {
    stem = `_${stem}`;
  }

  const room = GITLAB_MAX_KEY_LENGTH - BASE64_KEY_SUFFIX.length;
  return `${stem.slice(0, room)}${BASE64_KEY_SUFFIX}`;
}
