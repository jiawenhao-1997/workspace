import { useEffect, useState } from "react";
import { api } from "../api";
import { useAppStore, applyTheme } from "../store";
import type { Theme } from "../types";
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  Download,
  Upload,
  Database,
  Trash2,
  RefreshCw,
  Sparkles,
  Check,
  User,
  Cloud,
  Edit3,
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
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const appName = useAppStore((s) => s.appName);
  const setAppName = useAppStore((s) => s.setAppName);
  const [exportContent, setExportContent] = useState("");
  const [exporting, setExporting] = useState(false);

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
  }, []);

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

  async function exportData() {
    setExporting(true);
    try {
      const content = await api.exportData();
      setExportContent(content);
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${appName.toLowerCase().replace(/\s+/g, "-")}-export-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[800px] px-8 py-8">
        <div className="mb-8">
          <h1 className="h-display">设置</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            个性化你的工作台
          </p>
        </div>

        {/* 用户信息 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <User size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">用户信息</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                设置你的昵称、状态和头像颜色
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
                编辑
              </button>
            </div>
          ) : (
            <div className="space-y-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">头像颜色</label>
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
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">昵称</label>
                <input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="input"
                  placeholder="输入你的昵称"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">状态</label>
                <input
                  value={userStatus}
                  onChange={(e) => setUserStatus(e.target.value)}
                  className="input"
                  placeholder="例如：专注中、忙碌中"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditingUser(false)} className="btn btn-ghost">
                  取消
                </button>
                <button onClick={saveUserProfile} className="btn btn-primary">
                  保存
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
              <h2 className="text-[14px] font-semibold">应用名称</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                自定义显示名称
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
              <h2 className="text-[14px] font-semibold">外观</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                主题、字体与界面偏好
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "light", label: "浅色", icon: <Sun size={16} /> },
              { id: "dark", label: "深色", icon: <Moon size={16} /> },
              { id: "system", label: "跟随系统", icon: <Monitor size={16} /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as Theme)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-4 transition-all",
                  theme === t.id
                    ? "border-accent-500 bg-accent-50/30"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                )}
              >
                <span
                  className={cn(
                    theme === t.id ? "text-accent-500" : "text-[var(--text-secondary)]"
                  )}
                >
                  {t.icon}
                </span>
                <span className="text-[13px] font-medium">{t.label}</span>
                {theme === t.id && (
                  <Check size={14} className="text-accent-500 ml-auto" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* 快捷键 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Keyboard size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">键盘快捷键</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                提高你的操作效率
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { keys: ["⌘", "K"], desc: "打开命令面板" },
              { keys: ["⌘", "Space"], desc: "命令面板（备用）" },
              { keys: ["⌘", "Shift", "Space"], desc: "AI 助手" },
              { keys: ["⌘", "N"], desc: "快速新建" },
              { keys: ["⌘", "1"], desc: "仪表盘" },
              { keys: ["⌘", "2"], desc: "项目" },
              { keys: ["⌘", "3"], desc: "任务" },
              { keys: ["⌘", "4"], desc: "笔记" },
              { keys: ["Esc"], desc: "关闭面板" },
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
              <h2 className="text-[14px] font-semibold">应用名称与同步</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                自定义应用名称和云同步设置
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">应用名称</label>
              <input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="input"
                placeholder="RustDesk Workspace"
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)]">
              <div>
                <div className="text-[13px] font-medium">启用云同步</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  将数据同步到云端（支持 WebDAV / Git / S3）
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
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">同步方式</label>
                  <select
                    value={syncProvider}
                    onChange={(e) => setSyncProvider(e.target.value)}
                    className="input"
                  >
                    <option value="local">本地模式（不启用）</option>
                    <option value="webdav">WebDAV</option>
                    <option value="git">Git</option>
                    <option value="s3">S3 / 对象存储</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">服务器地址</label>
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
                保存同步设置
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
              <h2 className="text-[14px] font-semibold">数据</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                备份与导入
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)]">
              <div>
                <div className="text-[13px] font-medium">导出数据</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  导出所有项目、任务、笔记为 Markdown
                </div>
              </div>
              <button
                onClick={exportData}
                disabled={exporting}
                className="btn btn-secondary"
              >
                {exporting ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                导出
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)]">
              <div>
                <div className="text-[13px] font-medium">本地模式</div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  所有数据存储在本地 SQLite 数据库
                </div>
              </div>
              <span className="pill bg-green-50 text-success">已启用</span>
            </div>
          </div>
        </section>

        {/* 关于 */}
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold mb-3">关于</h2>
          <div className="space-y-2 text-[12px] text-[var(--text-secondary)]">
            <div className="flex justify-between">
              <span>版本</span>
              <span className="font-mono">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span>技术栈</span>
              <span className="font-mono">Rust + Tauri 2.0 + React</span>
            </div>
            <div className="flex justify-between">
              <span>数据库</span>
              <span className="font-mono">SQLite (本地)</span>
            </div>
            <div className="flex justify-between">
              <span>存储位置</span>
              <span className="font-mono text-[11px]">
                ~/Library/Application Support/RustDeskWorkspace
              </span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-[var(--border)] text-[11px] text-[var(--text-tertiary)] leading-relaxed">
            {appName} 是一个本地优先的个人生产力工具，融合了
            Notion、Obsidian、Raycast 和 Linear 的设计理念。
            <br />
            你的数据属于你。
          </div>
        </section>
      </div>
    </div>
  );
}