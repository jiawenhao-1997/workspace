import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { TrashItem } from "../types";
import {
  Trash2,
  RotateCcw,
  CheckSquare,
  FileText,
  Folder,
  BookOpen,
  RefreshCw,
  X,
} from "lucide-react";

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  task: { label: "trash.task", icon: <CheckSquare size={14} /> },
  note: { label: "trash.note", icon: <FileText size={14} /> },
  project: { label: "trash.project", icon: <Folder size={14} /> },
  knowledge: { label: "trash.knowledge", icon: <BookOpen size={14} /> },
};

function formatDeletedAt(raw: string): string {
  if (!raw) return "";
  // SQLite datetime('now') format is "YYYY-MM-DD HH:MM:SS" (UTC)
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function Trash() {
  const { t } = useTranslation();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listTrash());
    } catch (e) {
      console.error(t("trash.loadFailed"), e);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(item: TrashItem) {
    setBusy(true);
    try {
      await api.restoreTrashItem(item.item_type, item.id);
      await load();
    } catch (e: any) {
      alert(t("trash.restoreFailed", { error: e?.message ?? String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge(item: TrashItem) {
    if (!confirm(t("trash.confirmPurge", { name: item.title }))) return;
    setBusy(true);
    try {
      await api.purgeTrashItem(item.item_type, item.id);
      await load();
    } catch (e: any) {
      alert(t("trash.deleteFailed", { error: e?.message ?? String(e) }));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmpty() {
    if (!confirm(t("trash.confirmEmptyAll", { count: items.length }))) return;
    setBusy(true);
    try {
      await api.emptyTrash();
      await load();
    } catch (e: any) {
      alert(t("trash.emptyFailed", { error: e?.message ?? String(e) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-8 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="h-display">{t("trash.title")}</h1>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
              {t("trash.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="btn btn-secondary">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("common.refresh")}
            </button>
            {items.length > 0 && (
              <button onClick={handleEmpty} disabled={busy} className="btn btn-danger">
                <Trash2 size={14} />
                {t("trash.emptyTrash")}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="card p-12 text-center text-[13px] text-[var(--text-tertiary)]">
            {t("common.loading")}
          </div>
        ) : items.length === 0 ? (
          <div className="card p-12 text-center">
            <Trash2 size={32} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
            <div className="text-[13px] text-[var(--text-secondary)]">{t("trash.empty")}</div>
          </div>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {items.map((item) => {
              const meta = TYPE_META[item.item_type] ?? {
                label: item.item_type,
                icon: <FileText size={14} />,
              };
              return (
                <div
                  key={`${item.item_type}-${item.id}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="text-[var(--text-tertiary)]">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {item.title || t("trash.untitled")}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      <span className="pill bg-[var(--bg-tertiary)] text-[var(--text-secondary)] mr-2">
                        {t(meta.label)}
                      </span>
                      {t("trash.deletedAt")} {formatDeletedAt(item.deleted_at)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestore(item)}
                    disabled={busy}
                    className="btn btn-secondary btn-icon"
                    title={t("trash.restore")}
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    onClick={() => handlePurge(item)}
                    disabled={busy}
                    className="btn btn-danger btn-icon"
                    title={t("trash.purge")}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
