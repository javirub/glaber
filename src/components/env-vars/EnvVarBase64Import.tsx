import { useState } from "react";
import { FileKey2, Upload, FileText, FileCode } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Base64RowDraft, EnvVarType, FileBase64 } from "../../models";
import { fileNameToVarKey } from "../../utils/varKey";
import {
  GITLAB_MAX_VALUE_LENGTH,
  formatBytes,
  isGitLabMaskable,
  valueSizeState,
} from "../../utils/gitlabLimits";
import { useToast } from "../ui/ToastContext";
import "../ui/ImportOptionsDialog.css";
import "./EnvVarBase64Import.css";

interface EnvVarBase64ImportProps {
  /** The scope the new row will get, decided by the active filter. */
  defaultScope: string;
  onAdd: (draft: Base64RowDraft) => void;
}

export function EnvVarBase64Import({ defaultScope, onAdd }: EnvVarBase64ImportProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [encoded, setEncoded] = useState<FileBase64 | null>(null);
  const [key, setKey] = useState("");
  const [variableType, setVariableType] = useState<EnvVarType>("env_var");
  const [isProtected, setIsProtected] = useState(false);
  const [masked, setMasked] = useState(false);

  async function handleSelectFile() {
    // No extension filter: encoding any file is the whole point
    const selected = await open({ multiple: false });
    if (!selected || Array.isArray(selected)) return;

    try {
      const result = await invoke<FileBase64>("read_file_base64", { path: selected });
      setEncoded(result);
      setKey(fileNameToVarKey(result.file_name));
      setVariableType("env_var");
      setIsProtected(false);
      setMasked(false);
    } catch (e) {
      showToast(t("base64_read_failed", { error: String(e) }), "error");
      setEncoded(null);
    }
  }

  function handleAdd() {
    if (!encoded) return;
    onAdd({
      key: key.trim(),
      value: encoded.base64,
      variable_type: variableType,
      protected: isProtected,
      masked,
      description: t("base64_description", {
        file: encoded.file_name,
        size: formatBytes(encoded.byte_size),
      }),
    });
    setEncoded(null);
    setKey("");
  }

  const sizeState = encoded ? valueSizeState(encoded.base64.length) : "ok";
  const canAdd = encoded !== null && key.trim().length > 0 && sizeState !== "error";

  return (
    <div className="file-import-panel">
      <button type="button" className="file-import-select" onClick={handleSelectFile} aria-haspopup="dialog">
        <FileKey2 size={28} />
        <span>{encoded ? encoded.file_name : t("select_binary_file")}</span>
      </button>

      {encoded && (
        <div className="file-import-preview">
          <h4>{t("base64_preview_title")}</h4>

          <div className="base64-facts">
            <div className="base64-fact">
              <span className="base64-fact-label">{t("base64_file_size")}</span>
              <span className="base64-fact-value">{formatBytes(encoded.byte_size)}</span>
            </div>
            <div className="base64-fact">
              <span className="base64-fact-label">{t("base64_encoded_length")}</span>
              <span className={`base64-fact-value base64-size-${sizeState}`}>
                {t("base64_chars", { count: encoded.base64.length })}
              </span>
            </div>
            <div className="base64-fact">
              <span className="base64-fact-label">{t("var_scope")}</span>
              <span className="base64-fact-value">{t("base64_scope_hint", { scope: defaultScope })}</span>
            </div>
          </div>

          {sizeState === "error" && (
            <p className="base64-warning base64-warning-error">
              {t("base64_too_large", { max: GITLAB_MAX_VALUE_LENGTH })}
            </p>
          )}
          {sizeState === "warn" && (
            <p className="base64-warning">
              {t("base64_size_warning", { count: encoded.base64.length, max: GITLAB_MAX_VALUE_LENGTH })}
            </p>
          )}

          <label className="base64-field">
            <span className="base64-fact-label">{t("base64_var_key")}</span>
            <input
              className="envvar-input"
              value={key}
              onChange={e => setKey(e.target.value)}
              // The variables view captures Ctrl+V to import clipboard env vars
              onPaste={e => e.stopPropagation()}
              placeholder="KEY_NAME"
            />
          </label>

          <div className="base64-type-options">
            <button
              type="button"
              className={`import-option-btn${variableType === "env_var" ? " import-option-btn-selected" : ""}`}
              onClick={() => setVariableType("env_var")}
              aria-pressed={variableType === "env_var"}
            >
              <span className="import-option-icon import-option-icon-unprotected">
                <FileText size={18} />
              </span>
              <span className="import-option-text">
                <span className="import-option-label">env_var</span>
                <span className="import-option-desc">{t("base64_type_env_var_desc")}</span>
              </span>
            </button>

            <button
              type="button"
              className={`import-option-btn${variableType === "file" ? " import-option-btn-selected" : ""}`}
              onClick={() => setVariableType("file")}
              aria-pressed={variableType === "file"}
            >
              <span className="import-option-icon import-option-icon-protected">
                <FileCode size={18} />
              </span>
              <span className="import-option-text">
                <span className="import-option-label">file</span>
                <span className="import-option-desc">{t("base64_type_file_desc")}</span>
              </span>
            </button>
          </div>

          <div className="base64-flags">
            <label className="base64-flag">
              <input
                type="checkbox"
                checked={isProtected}
                onChange={e => setIsProtected(e.target.checked)}
              />
              {t("var_protected")}
            </label>
            <label className="base64-flag">
              <input
                type="checkbox"
                checked={masked}
                onChange={e => setMasked(e.target.checked)}
              />
              {t("var_masked")}
            </label>
          </div>

          {masked && !isGitLabMaskable(encoded.base64) && (
            <p className="base64-warning">{t("base64_masked_warning")}</p>
          )}

          <button className="file-import-btn" onClick={handleAdd} type="button" disabled={!canAdd}>
            <Upload size={16} /> {t("base64_add_row")}
          </button>
        </div>
      )}
    </div>
  );
}
