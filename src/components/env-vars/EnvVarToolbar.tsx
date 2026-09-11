import { Plus, ClipboardPaste, Save, RefreshCw, Filter } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnvVarInputMode } from "../../models";
import { ALL_SCOPES } from "../../utils/scopeFilter";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import "./EnvVarToolbar.css";

interface EnvVarToolbarProps {
  inputMode: EnvVarInputMode;
  setInputMode: (mode: EnvVarInputMode) => void;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  scopeFilter: string;
  setScopeFilter: (scope: string) => void;
  availableScopes: string[];
  countsByScope: Map<string, number>;
  onAddRow: () => void;
  onPasteClipboard: () => void;
  onSave: () => void;
  onRefresh: () => void;
}

export function EnvVarToolbar({
  inputMode, setInputMode,
  isSaving, hasUnsavedChanges,
  scopeFilter, setScopeFilter, availableScopes, countsByScope,
  onAddRow, onPasteClipboard, onSave, onRefresh,
}: EnvVarToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="envvar-toolbar">
      <div className="envvar-toolbar-tabs">
        <button
          className={`envvar-tab ${inputMode === "manual" ? "envvar-tab-active" : ""}`}
          onClick={() => setInputMode("manual")}
          type="button"
        >
          {t("manual_mode")}
        </button>
        <button
          className={`envvar-tab ${inputMode === "file" ? "envvar-tab-active" : ""}`}
          onClick={() => setInputMode("file")}
          type="button"
        >
          {t("file_mode")}
        </button>
        <button
          className={`envvar-tab ${inputMode === "base64" ? "envvar-tab-active" : ""}`}
          onClick={() => setInputMode("base64")}
          type="button"
        >
          {t("base64_mode")}
        </button>
      </div>

      {availableScopes.length > 1 && (
        <div className="envvar-toolbar-filter">
          <Filter size={14} />
          <select
            className="envvar-scope-filter"
            value={scopeFilter}
            onChange={e => setScopeFilter(e.target.value)}
            aria-label={t("filter_by_scope")}
          >
            <option value={ALL_SCOPES}>{t("scope_filter_all")}</option>
            {availableScopes.map(scope => (
              <option key={scope} value={scope}>
                {t("scope_filter_option", { scope, count: countsByScope.get(scope) ?? 0 })}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="envvar-toolbar-actions">
        {inputMode === "manual" && (
          <>
            <button className="envvar-toolbar-btn" onClick={onAddRow} type="button">
              <Plus size={16} /> {t("add_row")}
            </button>
            <button className="envvar-toolbar-btn" onClick={onPasteClipboard} type="button">
              <ClipboardPaste size={16} /> {t("paste_clipboard")}
            </button>
          </>
        )}
        <button className="envvar-toolbar-btn" onClick={onRefresh} type="button">
          <RefreshCw size={16} /> {t("refresh_variables")}
        </button>
        <button
          className="envvar-toolbar-btn envvar-save-btn"
          onClick={onSave}
          disabled={isSaving || !hasUnsavedChanges}
          type="button"
        >
          {isSaving ? <LoadingSpinner size={16} /> : <Save size={16} />}
          {t("save_changes")}
        </button>
      </div>
    </div>
  );
}
