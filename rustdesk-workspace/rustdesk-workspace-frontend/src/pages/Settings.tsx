import { useEffect, useState } from "react";
import { save, open, confirm } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import { useAppStore, applyTheme } from "../store";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, type Locale } from "../i18n";
import type { Theme } from "../types";
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  Upload,
  Database,
  Trash2,
  RefreshCw,
  Sparkles,
  Check,
  User,
  Cloud,
  Edit3,
  Bell,
  Globe,
} from "lucide-react";
import { cn, adjustColor } from "../utils";

const AVATAR_COLORS = [
  "#3B82F6", // 蓝色
  "#22C55E", // 绿色
  "#F59E0B", // 橙色
  "#EF4444", // 红色
  "#8B5CF6", // 紫色
  "#EC4899", // 粉色
  "#14B8A6", // 青色
  "#6366F1", // 靛蓝
];

export function Settings() {
  const { t } = useTranslation();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const language = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const appName = useAppStore((s) => s.appName);
  const setAppName = useAppStore((s) => s.setAppName);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const [notifEnabled, setNotifEnabled] = useState(true);

  // 用户配置
  const [userName, setUserName] = useState(user.name);
  const [userStatus, setUserStatus] = useState(user.status);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [editingUser, setEditingUser] = useState(false);

  // 云同步配置
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncProvider, setSyncProvider] = useState("local");
  const [syncEndpoint, setSyncEndpoint] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);

  useEffect(() => {
    // 同步用户状态到表单
    setUserName(user.name);
    setUserStatus(user.status);
    setAvatarColor(user.avatarColor);
  }, [user]);

  useEffect(() => {
    // 加载云同步设置
    loadSyncSettings();
    // 加载提醒通知设置
    api
      .getSetting("notifications_enabled")
      .then((v) => {
        if (v !== null) setNotifEnabled(v !== "false");
      })
      .catch((e) => console.error(e));
  }, []);

  async function toggleNotifications(enabled: boolean) {
    setNotifEnabled(enabled);
    try {
      await api.setSetting("notifications_enabled", enabled ? "true" : "false");
    } catch (e) {
      console.error(e);
      setNotifEnabled(!enabled);
    }
  }

  async function loadSyncSettings() {
    try {
      const enabled = await api.getSetting("sync_enabled");
      const provider = await api.getSetting("sync_provider");
      const endpoint = await api.getSetting("sync_endpoint");
      if (enabled) setSyncEnabled(enabled === "true");
      if (provider) setSyncProvider(provider);
      if (endpoint) setSyncEndpoint(endpoint);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveUserProfile() {
    setUser({ name: userName, status: userStatus, avatarColor });
    setEditingUser(false);
  }

  async function saveSyncSettings() {
    setSyncLoading(true);
    try {
      await api.setSetting("app_name", appName);
      await api.setSetting("sync_enabled", syncEnabled.toString());
      await api.setSetting("sync_provider", syncProvider);
      if (syncEndpoint) await api.setSetting("sync_endpoint", syncEndpoint);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleBackup() {
    setBackupMsg("");
    const path = await save({
      title: t("settings.selectBackupLocation"),
      defaultPath: `rustdesk-workspace-backup-${new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, "-")}.json`,
      filters: [{ name: t("settings.backupFile"), extensions: ["json"] }],
    });
    if (!path) return;

    setBackingUp(true);
    try {
      const msg = await api.exportBackup(path);
      setBackupMsg(msg);
    } catch (e: any) {
      setBackupMsg(t("settings.backupFailed", { error: e?.message ?? String(e) }));
    } finally {
      setBackingUp(false);
    }
  }

  async function handleRestore() {
    setBackupMsg("");
    const path = await open({
      title: t("settings.restoreFromBackup"),
      multiple: false,
      directory: false,
      filters: [{ name: t("settings.backupFile"), extensions: ["json"] }],
    });
    if (!path || typeof path !== "string") return;

    const ok = await confirm(
      t("settings.restoreWarning"),
      { title: t("settings.restoreTitle"), kind: "warning", okLabel: t("settings.overwriteRestore"), cancelLabel: t("common.cancel") }
    );
    if (!ok) return;

    setRestoring(true);
    try {
      const msg = await api.importBackup(path);
      setBackupMsg(t("settings.restoreSuccess"));
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setBackupMsg(t("settings.restoreFailed", { error: e?.message ?? String(e) }));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[800px] px-8 py-8">
        <div className="mb-8">
          <h1 className="h-display">{t("settings.title")}</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            {t("settings.subtitle")}
          </p>
        </div>

        {/* 用户信息 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <User size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{t("settings.userInfo")}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.userInfoDesc")}
              </p>
            </div>
          </div>
          {!editingUser ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white text-[14px] font-semibold"
                  style={{
                    background: `linear-gradient(135deg, ${user.avatarColor}, ${adjustColor(user.avatarColor, -30)})`
                  }}
                >
                  {user.name.charAt(0)}
                </div>
                <div>
                  <div className="text-[13px] font-medium">{user.name}</div>
                  <div className="text-[11px] text-[var(--text-tertiary)]">{user.status}</div>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(true)}
                className="btn btn-secondary"
              >
                <Edit3 size={14} />
                {t("settings.edit")}
              </button>
            </div>
          ) : (
            <div className="space-y-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t("settings.avatarColor")}</label>
                <div className="flex gap-2">
                  {AVATAR_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setAvatarColor(color)}
                      className={cn(
                        "h-8 w-8 rounded-full transition-transform",
                        avatarColor === color && "ring-2 ring-offset-2 ring-[var(--accent)] scale-110"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t("settings.nickname")}</label>
                <input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="input"
                  placeholder={t("settings.nicknamePlaceholder")}
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t("settings.status")}</label>
                <input
                  value={userStatus}
                  onChange={(e) => setUserStatus(e.target.value)}
                  className="input"
                  placeholder={t("settings.statusPlaceholder")}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingUser(false)} className="btn btn-ghost">
                  {t("common.cancel")}
                </button>
                <button onClick={saveUserProfile} className="btn btn-primary">
                  {t("common.save")}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 应用名称 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Cloud size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{t("settings.appName")}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.appNameDesc")}
              </p>
            </div>
          </div>
          <div>
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              className="input"
              placeholder="RustDesk Workspace"
            />
          </div>
        </section>

        {/* 主题 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <SettingsIcon size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{t("settings.appearance")}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.appearanceDesc")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "light", label: t("settings.light"), icon: <Sun size={16} /> },
              { id: "dark", label: t("settings.dark"), icon: <Moon size={16} /> },
              { id: "system", label: t("settings.system"), icon: <Monitor size={16} /> },
            ].map((t_theme) => (
              <button
                key={t_theme.id}
                onClick={() => setTheme(t_theme.id as Theme)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-4 transition-all",
                  theme === t_theme.id
                    ? "border-accent-500 bg-accent-50/30"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                )}
              >
                <span
                  className={cn(
                    theme === t_theme.id ? "text-accent-500" : "text-[var(--text-secondary)]"
                  )}
                >
                  {t_theme.icon}
                </span>
                <span className="text-[13px] font-medium">{t_theme.label}</span>
                {theme === t_theme.id && (
                  <Check size={14} className="text-accent-500 ml-auto" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* 语言 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Globe size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{t("settings.language")}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.languageDesc")}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SUPPORTED_LOCALES.map((locale) => (
              <button
                key={locale}
                onClick={() => setLanguage(locale)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-4 transition-all",
                  language === locale
                    ? "border-accent-500 bg-accent-50/30"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                )}
              >
                <span className="text-[14px] font-medium">
                  {locale === "zh-CN" ? "中文" : "English"}
                </span>
                {language === locale && (
                  <Check size={14} className="text-accent-500" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* 提醒 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Bell size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{t("settings.notifications")}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.notificationsDesc")}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)]">
            <div>
              <div className="text-[13px] font-medium">{t("settings.dueReminders")}</div>
              <div className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.dueRemindersDesc")}
              </div>
            </div>
            <button
              onClick={() => toggleNotifications(!notifEnabled)}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                notifEnabled ? "bg-accent-500" : "bg-[var(--border-strong)]"
              )}
              aria-label={t("settings.notifications")}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                  notifEnabled ? "left-[22px]" : "left-0.5"
                )}
              />
            </button>
          </div>
        </section>

        {/* 快捷键 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Keyboard size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{t("settings.keyboardShortcuts")}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.keyboardShortcutsDesc")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { keys: ["⌘", "K"], desc: t("settings.shortcuts.openCommandPalette") },
              { keys: ["⌘", "Space"], desc: t("settings.shortcuts.commandPaletteAlt") },
              { keys: ["⌘", "Shift", "Space"], desc: t("settings.shortcuts.aiAssistant") },
              { keys: ["⌘", "N"], desc: t("settings.shortcuts.quickNew") },
              { keys: ["⌘", "1"], desc: t("settings.shortcuts.dashboard") },
              { keys: ["⌘", "2"], desc: t("settings.shortcuts.projects") },
              { keys: ["⌘", "3"], desc: t("settings.shortcuts.tasks") },
              { keys: ["⌘", "4"], desc: t("settings.shortcuts.notes") },
              { keys: ["Esc"], desc: t("settings.shortcuts.closePanel") },
            ].map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-secondary)]"
              >
                <span className="text-[13px]">{s.desc}</span>
                <div className="flex items-center gap-1">
                  {s.keys.map((k, j) => (
                    <kbd key={j} className="kbd">
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 应用名称与云同步 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Cloud size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{t("settings.cloudSync")}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.cloudSyncDesc")}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t("settings.appName")}</label>
              <input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="input"
                placeholder="RustDesk Workspace"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)]">
              <div>
                <div className="text-[13px] font-medium">{t("settings.enableCloudSync")}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t("settings.enableCloudSyncDesc")}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  onChange={(e) => setSyncEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[var(--bg-tertiary)] peer-focus:ring-2 peer-focus:ring-accent-500/20 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-500"></div>
              </label>
            </div>
            {syncEnabled && (
              <div className="space-y-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t("settings.syncMethod")}</label>
                  <select
                    value={syncProvider}
                    onChange={(e) => setSyncProvider(e.target.value)}
                    className="input"
                  >
                    <option value="local">{t("settings.syncMethodLocal")}</option>
                    <option value="webdav">{t("settings.syncMethodWebdav")}</option>
                    <option value="git">{t("settings.syncMethodGit")}</option>
                    <option value="s3">{t("settings.syncMethodS3")}</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">{t("settings.serverAddress")}</label>
                  <input
                    value={syncEndpoint}
                    onChange={(e) => setSyncEndpoint(e.target.value)}
                    className="input"
                    placeholder={
                      syncProvider === "webdav"
                        ? "https://your-webdav-server.com/dav"
                        : syncProvider === "git"
                        ? "https://github.com/username/repo"
                        : syncProvider === "s3"
                        ? "https://s3.region.amazonaws.com/bucket"
                        : ""
                    }
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={saveSyncSettings}
                disabled={syncLoading}
                className="btn btn-primary"
              >
                {syncLoading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {t("settings.saveSyncSettings")}
              </button>
            </div>
          </div>
        </section>

        {/* 数据管理 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Database size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">{t("settings.data")}</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {t("settings.dataDesc")}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)]">
              <div>
                <div className="text-[13px] font-medium">{t("settings.fullBackup")}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t("settings.fullBackupDesc")}
                </div>
              </div>
              <button
                onClick={handleBackup}
                disabled={backingUp}
                className="btn btn-secondary"
              >
                {backingUp ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {t("settings.backup")}
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)]">
              <div>
                <div className="text-[13px] font-medium">{t("settings.restoreFromBackup")}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t("settings.restoreFromBackupDesc")}
                </div>
              </div>
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="btn btn-secondary"
              >
                {restoring ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Upload size={14} />
                )}
                {t("settings.restore")}
              </button>
            </div>

            {backupMsg && (
              <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-[12px] text-[var(--text-secondary)]">
                {backupMsg}
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)]">
              <div>
                <div className="text-[13px] font-medium">{t("settings.localMode")}</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t("settings.localModeDesc")}
                </div>
              </div>
              <span className="pill bg-green-50 text-success">{t("settings.enabled")}</span>
            </div>
          </div>
        </section>

        {/* 关于 */}
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold mb-3">{t("settings.about")}</h2>
          <div className="space-y-2 text-[12px] text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>{t("settings.version")}</span>
              <span className="font-mono">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span>{t("settings.techStack")}</span>
              <span className="font-mono">Rust + Tauri 2.0 + React</span>
            </div>
            <div className="flex justify-between">
              <span>{t("settings.database")}</span>
              <span className="font-mono">{t("settings.databaseValue")}</span>
            </div>
            <div className="flex justify-between">
              <span>{t("settings.storageLocation")}</span>
              <span className="font-mono text-[11px]">
                ~/Library/Application Support/RustDeskWorkspace
              </span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--border)] text-[11px] text-[var(--text-tertiary)] leading-relaxed">
            {t("settings.aboutDescription", { appName })}
          </div>
        </section>
      </div>
    </div>
  );
}