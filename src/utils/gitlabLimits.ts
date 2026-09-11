/** GitLab caps a CI/CD variable value at 10 000 characters. */
export const GITLAB_MAX_VALUE_LENGTH = 10_000;

/** Where we start warning that a value is getting close to the cap. */
export const GITLAB_VALUE_WARN_LENGTH = 8_000;

/** GitLab refuses to mask anything shorter than this. */
export const GITLAB_MASKED_MIN_LENGTH = 8;

export type ValueSizeState = "ok" | "warn" | "error";

export function valueSizeState(length: number): ValueSizeState {
  if (length > GITLAB_MAX_VALUE_LENGTH) return "error";
  if (length >= GITLAB_VALUE_WARN_LENGTH) return "warn";
  return "ok";
}

/**
 * Whether GitLab is likely to accept `masked: true` for this value: a single
 * line of at least 8 characters drawn from the Base64 alphabet plus @ : . ~ -.
 *
 * Advisory only. The accepted charset varies between GitLab versions — notably
 * whether Base64 padding (`=`) is allowed — so callers must warn, never block.
 */
export function isGitLabMaskable(value: string): boolean {
  return new RegExp(`^[A-Za-z0-9+/@:.~-]{${GITLAB_MASKED_MIN_LENGTH},}$`).test(value);
}

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = unit === 0 ? String(value) : value.toFixed(1);
  return `${rounded} ${BYTE_UNITS[unit]}`;
}
