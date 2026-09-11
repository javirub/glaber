import { EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnvVarRow } from "../../models";
import { ALL_SCOPES, type HiddenRowStats } from "../../utils/scopeFilter";
import { EnvVarRowComponent } from "./EnvVarRow";
import "./EnvVarTable.css";

interface EnvVarTableProps {
  rows: readonly EnvVarRow[];
  maskedServerKeys: Set<string>;
  hiddenStats: HiddenRowStats;
  scopeFilter: string;
  onClearFilter: () => void;
  onUpdate: (rowId: string, field: keyof EnvVarRow, value: string | boolean) => void;
  onDelete: (rowId: string) => void;
  onUndoEdit: (rowId: string) => void;
  onUndoDelete: (rowId: string) => void;
}

export function EnvVarTable({
  rows, maskedServerKeys, hiddenStats, scopeFilter, onClearFilter,
  onUpdate, onDelete, onUndoEdit, onUndoDelete,
}: EnvVarTableProps) {
  const { t } = useTranslation();

  const bannerSeverity = hiddenStats.invalid > 0
    ? "envvar-filter-banner-invalid"
    : hiddenStats.unsaved > 0
      ? "envvar-filter-banner-unsaved"
      : "";

  const banner = hiddenStats.hidden > 0 && (
    <div className={`envvar-filter-banner ${bannerSeverity}`} role="status">
      <EyeOff size={14} />
      <span>
        {t("hidden_rows_banner", { count: hiddenStats.hidden })}
        {hiddenStats.unsaved > 0 && ` ${t("hidden_rows_unsaved", { count: hiddenStats.unsaved })}`}
        {hiddenStats.invalid > 0 && ` ${t("hidden_rows_invalid", { count: hiddenStats.invalid })}`}
      </span>
      <button type="button" className="envvar-filter-banner-btn" onClick={onClearFilter}>
        {t("show_all_scopes")}
      </button>
    </div>
  );

  if (rows.length === 0) {
    return (
      <>
        {banner}
        <p className="envvar-empty">
          {scopeFilter === ALL_SCOPES ? t("no_variables") : t("no_variables_for_scope")}
        </p>
      </>
    );
  }

  return (
    <>
      {banner}
      <div className="envvar-table-wrapper">
        <table className="envvar-table">
          <thead>
            <tr>
              <th className="envvar-th-status"></th>
              <th>{t("var_key")}</th>
              <th>{t("var_value")}</th>
              <th>{t("var_type")}</th>
              <th>{t("var_protected")}</th>
              <th>{t("var_masked")}</th>
              <th>{t("var_scope")}</th>
              <th>{t("var_description")}</th>
              <th>{t("var_actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <EnvVarRowComponent
                key={row.rowId}
                row={row}
                existingMaskedKeys={maskedServerKeys}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onUndoEdit={onUndoEdit}
                onUndoDelete={onUndoDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
