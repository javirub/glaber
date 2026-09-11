import { describe, it, expect } from "bun:test";
import {
  formatBytes,
  isGitLabMaskable,
  valueSizeState,
} from "../src/utils/gitlabLimits";

describe("valueSizeState", () => {
  it("is ok below the warning threshold", () => {
    expect(valueSizeState(0)).toBe("ok");
    expect(valueSizeState(7_999)).toBe("ok");
  });

  it("warns from 8000 characters", () => {
    expect(valueSizeState(8_000)).toBe("warn");
    expect(valueSizeState(10_000)).toBe("warn");
  });

  it("errors past GitLab's 10000 character limit", () => {
    expect(valueSizeState(10_001)).toBe("error");
  });
});

describe("isGitLabMaskable", () => {
  it("rejects values shorter than 8 characters", () => {
    expect(isGitLabMaskable("AAAAAAA")).toBe(false);
  });

  it("accepts a plain Base64 body", () => {
    expect(isGitLabMaskable("AAAAAAAA")).toBe(true);
    expect(isGitLabMaskable("abc+/def@:.~-")).toBe(true);
  });

  it("rejects Base64 padding, which GitLab often refuses", () => {
    expect(isGitLabMaskable("QUJDREVGRw==")).toBe(false);
  });

  it("rejects whitespace and line breaks", () => {
    expect(isGitLabMaskable("AAAA AAAA")).toBe(false);
    expect(isGitLabMaskable("AAAAAAAA\nBBBB")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("keeps small sizes in bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
  });

  it("switches unit at 1024", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("handles megabytes", () => {
    expect(formatBytes(1024 * 1024 * 3)).toBe("3.0 MB");
  });
});
