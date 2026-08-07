import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Plus, MessageSquare, Trash2 } from "lucide-react";
import { useAppStore } from "../store";
import { api } from "../api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "ai_sessions_v1";
const ACTIVE_KEY = "ai_active_session_v1";

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "你好！我是你的 AI 助手 🤖\n\n我可以帮你：\n• 总结今天的工作\n• 整理笔记和知识库\n• 分析项目风险\n• 生成任务建议\n• 搜索本地知识库\n\n试试下面的快捷操作，或者直接向我提问。",
  time: new Date().toISOString(),
};

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function newSession(): Session {
  const now = new Date().toISOString();
  return {
    id: Date.now().toString(),
    title: "新对话",
    messages: [WELCOME],
    createdAt: now,
    updatedAt: now,
  };
}

export function AiPanel() {
  const setOpen = useAppStore((s) => s.setAiPanelOpen);
  const [sessions, setSessions] = useState<Session[]>(() => {
    const loaded = loadSessions();
    if (loaded.length === 0) return [newSession()];
    return loaded;
  });
  const [activeId, setActiveId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_KEY) || "";
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 确保 activeId 始终对应一个 session
  useEffect(() => {
    if (sessions.length === 0) {
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
      return;
    }
    if (!sessions.find((s) => s.id === activeId)) {
      setActiveId(sessions[0].id);
    }
  }, [sessions, activeId]);

  // 持久化
  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  const activeSession = sessions.find((s) => s.id === activeId) || sessions[0];
  const messages = activeSession?.messages || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function updateActive(updater: (s: Session) => Session) {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? updater(s) : s))
    );
  }

  function handleNewSession() {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
  }

  function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (sessions.length <= 1) {
      // 至少保留一个
      const s = newSession();
      setSessions([s]);
      setActiveId(s.id);
      return;
    }
    const filtered = sessions.filter((s) => s.id !== id);
    setSessions(filtered);
    if (activeId === id) setActiveId(filtered[0].id);
  }

  function deriveTitle(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length <= 20) return trimmed;
    return trimmed.slice(0, 20) + "…";
  }

  async function send(prompt?: string, contextType?: string) {
    const text = prompt ?? input;
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      time: new Date().toISOString(),
    };

    // 只在当前 session 第一条用户消息时更新标题
    const isFirstUserMsg =
      messages.filter((m) => m.role === "user").length === 0;

    updateActive((s) => ({
      ...s,
      title: isFirstUserMsg ? deriveTitle(text) : s.title,
      updatedAt: new Date().toISOString(),
      messages: [...s.messages, userMsg],
    }));

    setInput("");
    setLoading(true);

    try {
      const response = await api.aiAssistant(text, contextType ?? null);
      const aiMsg: Message = {
        id: Date.now().toString() + "-ai",
        role: "assistant",
        content: response,
        time: new Date().toISOString(),
      };
      updateActive((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        messages: [...s.messages, aiMsg],
      }));
    } catch (e: any) {
      const errMsg: Message = {
        id: Date.now().toString() + "-err",
        role: "assistant",
        content: `出错了：${e?.message ?? String(e)}`,
        time: new Date().toISOString(),
      };
      updateActive((s) => ({
        ...s,
        messages: [...s.messages, errMsg],
      }));
    } finally {
      setLoading(false);
    }
  }

  async function quickAction(type: string) {
    if (loading) return;

    // 快捷操作也作为一条用户消息记录
    const labels: Record<string, string> = {
      summarize_today: "📊 总结今天",
      summarize_notes: "📝 整理笔记",
      project_risks: "⚠️ 项目风险",
      general_suggestion: "✨ 生成建议",
    };
    const label = labels[type] || type;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: label,
      time: new Date().toISOString(),
    };

    const isFirstUserMsg =
      messages.filter((m) => m.role === "user").length === 0;

    updateActive((s) => ({
      ...s,
      title: isFirstUserMsg ? label : s.title,
      updatedAt: new Date().toISOString(),
      messages: [...s.messages, userMsg],
    }));

    setLoading(true);
    try {
      const response = await api.aiAssistant("", type);
      const aiMsg: Message = {
        id: Date.now().toString() + "-ai",
        role: "assistant",
        content: response,
        time: new Date().toISOString(),
      };
      updateActive((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        messages: [...s.messages, aiMsg],
      }));
    } catch (e: any) {
      const errMsg: Message = {
        id: Date.now().toString() + "-err",
        role: "assistant",
        content: `出错了：${e?.message ?? String(e)}`,
        time: new Date().toISOString(),
      };
      updateActive((s) => ({
        ...s,
        messages: [...s.messages, errMsg],
      }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 backdrop-anim"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="fixed right-4 top-4 bottom-4 w-[720px] flex rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-soft-lg animate-fade-in-scale overflow-hidden">
        {/* 左侧：会话列表 */}
        <div className="w-[220px] flex flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
            <div className="text-[12px] font-semibold text-[var(--text-secondary)]">
              对话历史
            </div>
            <button
              onClick={handleNewSession}
              className="btn btn-primary btn-icon"
              title="新对话"
              aria-label="新对话"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`group flex items-center gap-2 rounded-lg px-2 py-2 cursor-pointer text-[12px] transition-colors ${
                  s.id === activeId
                    ? "bg-accent-500/10 text-accent-700"
                    : "hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                }`}
              >
                <MessageSquare size={12} className="shrink-0 opacity-60" />
                <div className="flex-1 truncate">{s.title}</div>
                <button
                  onClick={(e) => handleDeleteSession(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity btn btn-ghost btn-icon"
                  title="删除对话"
                  aria-label="删除对话"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：对话内容 */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white">
                <Sparkles size={14} />
              </div>
              <div>
                <div className="text-[13px] font-semibold">AI 助手</div>
                <div className="text-[10px] text-[var(--text-tertiary)]">
                  本地优先 · 隐私至上
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="btn btn-ghost btn-icon"
              aria-label="关闭"
            >
              <X size={14} />
            </button>
          </div>

          {/* 快捷操作 */}
          <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              快捷操作
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => quickAction("summarize_today")}
                className="btn btn-secondary text-[11px] h-auto py-2 px-3 justify-start"
              >
                📊 总结今天
              </button>
              <button
                onClick={() => quickAction("summarize_notes")}
                className="btn btn-secondary text-[11px] h-auto py-2 px-3 justify-start"
              >
                📝 整理笔记
              </button>
              <button
                onClick={() => quickAction("project_risks")}
                className="btn btn-secondary text-[11px] h-auto py-2 px-3 justify-start"
              >
                ⚠️ 项目风险
              </button>
              <button
                onClick={() => quickAction("general_suggestion")}
                className="btn btn-secondary text-[11px] h-auto py-2 px-3 justify-start"
              >
                ✨ 生成建议
              </button>
            </div>
          </div>

          {/* 消息列表 */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-accent-500 text-white"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[var(--bg-tertiary)] rounded-xl px-3 py-2 text-[13px]">
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">●</span>
                    <span
                      className="animate-pulse"
                      style={{ animationDelay: "150ms" }}
                    >
                      ●
                    </span>
                    <span
                      className="animate-pulse"
                      style={{ animationDelay: "300ms" }}
                    >
                      ●
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 输入框 */}
          <div className="border-t border-[var(--border)] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="向 AI 助手提问..."
                rows={1}
                className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--text-tertiary)] focus:border-accent-500 focus:ring-2 focus:ring-accent-500/10"
                style={{ maxHeight: "100px" }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="btn btn-primary btn-icon"
                aria-label="发送"
              >
                <Send size={14} />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
              <kbd className="kbd">↵</kbd>
              <span>发送 · </span>
              <kbd className="kbd">⇧↵</kbd>
              <span>换行</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
