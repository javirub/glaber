import type { EnvVarRow } from "../models";

/** Sentinel for "no filter". Not a valid GitLab scope, so it cannot collide with one. */
export const ALL_SCOPES = "__all__";

/** GitLab's wildcard scope, which always sorts first. */
export const WILDCARD_SCOPE = "*";

export interface HiddenRowStats {
  /** Rows the active filter is hiding. */
  hidden: number;
  /** Of those, how many carry unsaved changes. */
  unsaved: number;
  /** Of those, how many failed validation. */
  invalid: number;
}

/** Every scope present in the table, `*` first and the rest alphabetically. */
export function distinctScopes(rows: readonly EnvVarRow[]): string[] {
  const scopes = new Set<string>();
  for (const row of rows) {
    scopes.add(row.environment_scope);
  }

  const rest = [...scopes].filter(s => s !== WILDCARD_SCOPE).sort((a, b) => a.localeCompare(b));
  return scopes.has(WILDCARD_SCOPE) ? [WILDCARD_SCOPE, ...rest] : rest;
}

/**
 * Display-only filtering. Never call this before validating or saving: a hidden
 * row is still a row that has to be validated and written to GitLab.
 *
 * Matching is exact — `review/*` is a literal scope string, not a glob.
 */
export function filterRowsByScope(rows: readonly EnvVarRow[], scope: string): readonly EnvVarRow[] {
  if (scope === ALL_SCOPES) return rows;
  return rows.filter(row => row.environment_scope === scope);
}

/** How many rows the active filter hides, and how many of those need attention. */
export function hiddenRowStats(rows: readonly EnvVarRow[], scope: string): HiddenRowStats {
  if (scope === ALL_SCOPES) return { hidden: 0, unsaved: 0, invalid: 0 };

  let hidden = 0;
  let unsaved = 0;
  let invalid = 0;

  for (const row of rows) {
    if (row.environment_scope === scope) continue;
    hidden++;
    if (row.status !== "existing") unsaved++;
    if (row.errors.length > 0) invalid++;
  }

  return { hidden, unsaved, invalid };
}

/** Row count per scope, for the filter labels. */
export function scopeCounts(rows: readonly EnvVarRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.environment_scope, (counts.get(row.environment_scope) ?? 0) + 1);
  }
  return counts;
}
