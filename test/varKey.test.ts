import { describe, it, expect } from "bun:test";
import { fileNameToVarKey, GITLAB_MAX_KEY_LENGTH } from "../src/utils/varKey";

describe("fileNameToVarKey", () => {
  it("uppercases and replaces separators", () => {
    expect(fileNameToVarKey("my-cert.p12")).toBe("MY_CERT_P12_BASE64");
  });

  it("takes the basename of a Windows path and collapses spaces", () => {
    expect(fileNameToVarKey(String.raw`C:\certs\a b.pem`)).toBe("A_B_PEM_BASE64");
  });

  it("takes the basename of a POSIX path", () => {
    expect(fileNameToVarKey("/home/javi/kube.config")).toBe("KUBE_CONFIG_BASE64");
  });

  it("prefixes an underscore when the name starts with a digit", () => {
    expect(fileNameToVarKey("2fa.json")).toBe("_2FA_JSON_BASE64");
  });

  it("trims the leading separator of a dotfile", () => {
    expect(fileNameToVarKey(".env.local")).toBe("ENV_LOCAL_BASE64");
  });

  it("falls back to FILE when nothing usable is left", () => {
    expect(fileNameToVarKey("...")).toBe("FILE_BASE64");
    expect(fileNameToVarKey("")).toBe("FILE_BASE64");
  });

  it("keeps accents from producing invalid characters", () => {
    expect(fileNameToVarKey("contraseña.txt")).toBe("CONTRASE_A_TXT_BASE64");
  });

  it("stays within GitLab's key length limit", () => {
    const key = fileNameToVarKey("a".repeat(300) + ".pem");
    expect(key.length).toBeLessThanOrEqual(GITLAB_MAX_KEY_LENGTH);
    expect(key.endsWith("_BASE64")).toBe(true);
  });
});
