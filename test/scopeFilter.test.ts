import { describe, it, expect } from "bun:test";
import type { EnvVarRow, EnvVarStatus } from "../src/models";
import {
  ALL_SCOPES,
  distinctScopes,
  filterRowsByScope,
  hiddenRowStats,
  scopeCounts,
} from "../src/utils/scopeFilter";

function row(
  key: string,
  environment_scope: string,
  status: EnvVarStatus = "existing",
  errors: string[] = [],
): EnvVarRow {
  return {
    rowId: `${key}-${environment_scope}`,
    key,
    value: "v",
    variable_type: "env_var",
    protected: false,
    masked: false,
    environment_scope,
    description: "",
    status,
    originalKey: key,
    isMaskedOnServer: false,
    errors,
    originalSnapshot: null,
  };
}

describe("distinctScopes", () => {
  it("dedupes and puts the wildcard first", () => {
    const rows = [row("A", "production"), row("B", "*"), row("C", "production"), row("D", "qa")];
    expect(distinctScopes(rows)).toEqual(["*", "production", "qa"]);
  });

  it("omits the wildcard when no row uses it", () => {
    expect(distinctScopes([row("A", "qa"), row("B", "production")])).toEqual(["production", "qa"]);
  });

  it("includes the scope of deleted rows", () => {
    expect(distinctScopes([row("A", "staging", "deleted")])).toEqual(["staging"]);
  });

  it("returns nothing for an empty table", () => {
    expect(distinctScopes([])).toEqual([]);
  });
});

describe("filterRowsByScope", () => {
  const rows = [row("A", "*"), row("B", "production"), row("C", "review/*")];

  it("returns the same reference when nothing is filtered", () => {
    expect(filterRowsByScope(rows, ALL_SCOPES)).toBe(rows);
  });

  it("matches the scope exactly", () => {
    expect(filterRowsByScope(rows, "production").map(r => r.key)).toEqual(["B"]);
  });

  it("treats a wildcard scope as a literal string, not a glob", () => {
    expect(filterRowsByScope(rows, "review/*").map(r => r.key)).toEqual(["C"]);
    expect(filterRowsByScope(rows, "*").map(r => r.key)).toEqual(["A"]);
  });

  it("returns nothing for an unknown scope", () => {
    expect(filterRowsByScope(rows, "nope")).toEqual([]);
  });
});

describe("hiddenRowStats", () => {
  const rows = [
    row("A", "*"),
    row("B", "production", "edited"),
    row("C", "production"),
    row("D", "qa", "new", ["key_required"]),
  ];

  it("reports nothing when no filter is active", () => {
    expect(hiddenRowStats(rows, ALL_SCOPES)).toEqual({ hidden: 0, unsaved: 0, invalid: 0 });
  });

  it("counts only the rows outside the active scope", () => {
    expect(hiddenRowStats(rows, "production")).toEqual({ hidden: 2, unsaved: 1, invalid: 1 });
  });

  it("counts unsaved and invalid rows independently", () => {
    expect(hiddenRowStats(rows, "qa")).toEqual({ hidden: 3, unsaved: 1, invalid: 0 });
  });
});

describe("scopeCounts", () => {
  it("totals the rows per scope", () => {
    const counts = scopeCounts([row("A", "*"), row("B", "qa"), row("C", "qa")]);
    expect(counts.get("*")).toBe(1);
    expect(counts.get("qa")).toBe(2);
    expect(counts.get("missing")).toBeUndefined();
  });
});
