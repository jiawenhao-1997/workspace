import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Plus, MessageSquare, Trash2, Search, BookOpen, ChevronDown } from "lucide-react";
import { useAppStore } from "../store";
import { api } from "../api";
import { useTranslation } from "react-i18next";
import type { AiMessage, KnowledgeBase } from "../types";

type ChatMode = "auto" | "web_search";

interface Session {
  id: string;
  title: string;
  messages: AiMessage[];
  createdAt: string;
  updatedAt: string;
  selectedKbId?: string | null;
  chatMode?: ChatMode;
}

const STORAGE_KEY = "ai_sessions_v5";
const ACTIVE_KEY = "ai_active_session_v5";

function createWelcomeMessage(t: (key: string) => string): AiMessage {
  return {
    id: "welcome",
    role: "assistant",
    content: t("aiPanel.welcomeContent"),
    time: new Date().toISOString(),
  };
}

function loadSessions(createWelcome: (t: (key: string) => string) => AiMessage, t: (key: string) => string): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const now = new Date().toISOString();
      return [{
        id: Date.now().toString(),
        title: t("aiPanel.newSession"),
        messages: [createWelcomeMessage(t)],
        createdAt: now,
        updatedAt: now,
        selectedKbId: null,
        chatMode: "auto",
      }];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function AiPanel() {
  const { t, i18n } = useTranslation();
  const setOpen = useAppStore((s) => s.setAiPanelOpen);

  const [sessions, setSessions] = useState<Session[]>(() => {
    const loaded = loadSessions(createWelcomeMessage, t);
    if (loaded.length === 0) {
      const now = new Date().toISOString();
      return [{
        id: Date.now().toString(),
        title: t("aiPanel.newSession"),
        messages: [createWelcomeMessage(t)],
        createdAt: now,
        updatedAt: now,
        selectedKbId: null,
        chatMode: "auto",
      }];
    }
    return loaded.map(s => {
      let chatMode: ChatMode = s.chatMode ?? "auto";
      if ((s as any).webSearchEnabled === true) {
        chatMode = "web_search";
      }
      return {
        ...s,
        selectedKbId: s.selectedKbId ?? null,
        chatMode,
      };
    });
  });
  const [activeId, setActiveId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_KEY) || "";
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const pendingSendRef = useRef(false);
  const lastCompositionEndAtRef = useRef(0);
  const kbDropdownRef = useRef<HTMLDivElement>(null);
  const activeRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.listKnowledgeBases()
      .then(items => {
        if (mounted) setKnowledgeBases(items);
      })
      .catch(err => {
        console.error("Failed to load knowledge bases:", err);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (kbDropdownRef.current && !kbDropdownRef.current.contains(e.target as Node)) {
        setKbDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (sessions.length === 0) {
      const s = createNewSession();
      setSessions([s]);
      setActiveId(s.id);
      return;
    }
    if (!sessions.find((s) => s.id === activeId)) {
      setActiveId(sessions[0].id);
    }
  }, [sessions, activeId]);

  useEffect(() => {
    const timer = setTimeout(() => saveSessions(sessions), 300);
    return () => clearTimeout(timer);
  }, [sessions]);
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  const activeSession = sessions.find((s) => s.id === activeId) || sessions[0];
  const messages = activeSession?.messages || [];
  const selectedKbId = activeSession?.selectedKbId ?? null;
  const selectedKb = knowledgeBases.find(k => k.id === selectedKbId);
  const chatMode = activeSession?.chatMode ?? "auto";
  const isWebSearchMode = chatMode === "web_search" && !selectedKbId;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: loading ? "auto" : "smooth",
    });
  }, [messages, loading]);

  function updateActive(updater: (s: Session) => Session) {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? updater(s) : s))
    );
  }

  function setSelectedKb(kbId: string | null) {
    updateActive((s) => ({ ...s, selectedKbId: kbId }));
    setKbDropdownOpen(false);
  }

  function setChatMode(mode: ChatMode) {
    updateActive((s) => ({ ...s, chatMode: mode, selectedKbId: null }));
    setKbDropdownOpen(false);
  }

  function createNewSession(): Session {
    const now = new Date().toISOString();
    return {
      id: Date.now().toString(),
      title: t("aiPanel.newSession"),
      messages: [createWelcomeMessage(t)],
      createdAt: now,
      updatedAt: now,
      selectedKbId: null,
      chatMode: "auto",
    };
  }

  function handleNewSession() {
    const s = createNewSession();
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
  }

  function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (sessions.length <= 1) {
      const s = createNewSession();
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

  async function callAiAndReply(userText: string, contextType?: string) {
    const streamMsgId = Date.now().toString() + "-ai";
    updateActive((s) => ({
      ...s,
      updatedAt: new Date().toISOString(),
      messages: [
        ...s.messages,
        { id: streamMsgId, role: "assistant", content: "", time: new Date().toISOString() },
      ],
    }));

    try {
      const currentKbId = activeSession?.selectedKbId ?? null;
      let response: string;

      let effectiveContextType = contextType;
      if (!effectiveContextType) {
        if (currentKbId) {
          effectiveContextType = "auto";
        } else if (chatMode === "web_search") {
          effectiveContextType = "web_search";
        } else {
          effectiveContextType = "auto";
        }
      }

      const history = messages
        .filter((m) => m.id !== "welcome" && !m.id.endsWith("-err"))
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-20);

      const requestId =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeRequestIdRef.current = requestId;

      response = await api.aiAssistant(
        userText,
        effectiveContextType,
        currentKbId,
        history,
        (delta) => {
          updateActive((s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === streamMsgId ? { ...m, content: m.content + delta } : m
            ),
          }));
        },
        requestId
      );

      updateActive((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        messages: response
          ? s.messages.map((m) =>
              m.id === streamMsgId ? { ...m, content: response } : m
            )
          : s.messages.filter((m) => m.id !== streamMsgId),
      }));
    } catch (e: any) {
      const errText = `${t("aiPanel.errorPrefix")}${e?.message ?? String(e)}`;
      updateActive((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === streamMsgId
            ? { ...m, content: m.content ? `${m.content}\n\n---\n${errText}` : errText }
            : m
        ),
      }));
    } finally {
      activeRequestIdRef.current = null;
      setLoading(false);
    }
  }

  async function send(prompt?: string) {
    const text = prompt ?? input;
    if (!text.trim() || loading) return;

    const userMsg: AiMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      time: new Date().toISOString(),
    };

    const isFirstUserMsg =
      messages.filter((m) => m.role === "user").length === 0;

    const kbHint = selectedKb
      ? `\n\n_（${t("aiPanel.kbQueryRange").replace("《...》", `《${selectedKb.name}》`)}）_`
      : isWebSearchMode
      ? `\n\n_（${t("aiPanel.webSearchQueryMode")}）_`
      : `\n\n_（${t("aiPanel.autoQueryMode")}）_`;

    updateActive((s) => ({
      ...s,
      title: isFirstUserMsg ? deriveTitle(text) : s.title,
      updatedAt: new Date().toISOString(),
      messages: [...s.messages, { ...userMsg, content: userMsg.content }],
    }));

    setInput("");
    setLoading(true);

    await callAiAndReply(text);
  }

  async function quickAction(type: string) {
    if (loading) return;

    const labels: Record<string, string> = {
      summarize_today: t("aiPanel.summarizeToday"),
      summarize_notes: t("aiPanel.organizeNotes"),
      project_risks: t("aiPanel.projectRisks"),
      general_suggestion: t("aiPanel.generateSuggestions"),
    };
    const label = labels[type] || type;

    const userMsg: AiMessage = {
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

    const streamMsgId = Date.now().toString() + "-ai";
    updateActive((s) => ({
      ...s,
      updatedAt: new Date().toISOString(),
      messages: [
        ...s.messages,
        { id: streamMsgId, role: "assistant", content: "", time: new Date().toISOString() },
      ],
    }));

    try {
      const requestId =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeRequestIdRef.current = requestId;

      const prompts: Record<string, string> = {
        summarize_today: t("aiPanel.summarizeTodayPrompt"),
        summarize_notes: t("aiPanel.organizeNotesPrompt"),
        project_risks: t("aiPanel.projectRisksPrompt"),
        general_suggestion: t("aiPanel.generateSuggestionsPrompt"),
      };
      const realPrompt = prompts[type] || label;

      const response = await api.aiAssistant(realPrompt, type, null, undefined, (delta) => {
        updateActive((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === streamMsgId ? { ...m, content: m.content + delta } : m
          ),
        }));
      }, requestId);
      updateActive((s) => ({
        ...s,
        updatedAt: new Date().toISOString(),
        messages: response
          ? s.messages.map((m) =>
              m.id === streamMsgId ? { ...m, content: response } : m
            )
          : s.messages.filter((m) => m.id !== streamMsgId),
      }));
    } catch (e: any) {
      const errText = `${t("aiPanel.errorPrefix")}${e?.message ?? String(e)}`;
      updateActive((s) => ({
        ...s,
        messages: s.messages.map((m) =>
          m.id === streamMsgId
            ? { ...m, content: m.content ? `${m.content}\n\n---\n${errText}` : errText }
            : m
        ),
      }));
    } finally {
      activeRequestIdRef.current = null;
      setLoading(false);
    }
  }

  function handleStop() {
    const id = activeRequestIdRef.current;
    if (id) {
      api.cancelAiRequest(id).catch((err) => console.error("Failed to cancel request:", err));
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
        <div className="w-[220px] flex flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-3">
            <div className="text-[12px] font-semibold text-[var(--text-secondary)]">
              {t("aiPanel.sessionHistory")}
            </div>
            <button
              onClick={handleNewSession}
              className="btn btn-primary btn-icon"
              title={t("aiPanel.newSession")}
              aria-label={t("aiPanel.newSession")}
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
                  title={t("aiPanel.deleteSession")}
                  aria-label={t("aiPanel.deleteSession")}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white">
                <Sparkles size={14} />
              </div>
              <div>
                <div className="text-[13px] font-semibold">{t("aiPanel.title")}</div>
                <div className="text-[10px] text-[var(--text-tertiary)]">
                  {t("aiPanel.subtitle")}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="btn btn-ghost btn-icon"
              aria-label={t("aiPanel.close")}
            >
              <X size={14} />
            </button>
          </div>

          <div className="border-b border-[var(--border)] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <BookOpen size={13} className="text-[var(--text-tertiary)] shrink-0" />
              <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">{t("aiPanel.knowledgeBase")}</span>
              <div className="relative flex-1" ref={kbDropdownRef}>
                <button
                  onClick={() => setKbDropdownOpen(!kbDropdownOpen)}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors ${
                    selectedKb
                      ? "border-accent-200 bg-accent-50 text-accent-700"
                      : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--border-hover)]"
                  }`}
                >
                  <span className="truncate">
                    {selectedKb
                      ? `${selectedKb.icon || "📁"} ${selectedKb.name}`
                      : isWebSearchMode
                      ? t("aiPanel.webSearchModeDropdown")
                      : t("aiPanel.autoModeDropdown")}
                  </span>
                  <ChevronDown size={12} className={`shrink-0 transition-transform ${kbDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {kbDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-[280px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg z-10">
                    <button
                      onClick={() => setChatMode("auto")}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors hover:bg-[var(--bg-secondary)] ${
                        !selectedKbId && chatMode === "auto" ? "bg-accent-50 text-accent-700" : "text-[var(--text-primary)]"
                      }`}
                    >
                      <Sparkles size={12} className="shrink-0" />
                      <span className="truncate">{t("aiPanel.autoMode")}</span>
                    </button>
                    <button
                      onClick={() => setChatMode("web_search")}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors hover:bg-[var(--bg-secondary)] ${
                        !selectedKbId && chatMode === "web_search" ? "bg-accent-50 text-accent-700" : "text-[var(--text-primary)]"
                      }`}
                    >
                      <Search size={12} className="shrink-0" />
                      <span className="truncate">{t("aiPanel.webSearchMode")}</span>
                    </button>
                    <div className="border-t border-[var(--border)] my-1"></div>
                    <div className="px-3 py-1 text-[10px] text-[var(--text-tertiary)] font-medium">{t("aiPanel.knowledgeBaseMode")}</div>
                    {knowledgeBases.length === 0 && (
                      <div className="px-3 py-2 text-[11px] text-[var(--text-tertiary)]">
                        {t("aiPanel.noKnowledgeBase")}
                      </div>
                    )}
                    {knowledgeBases.map(b => (
                      <button
                        key={b.id}
                        onClick={() => { setSelectedKb(b.id); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left transition-colors hover:bg-[var(--bg-secondary)] ${
                          selectedKbId === b.id ? "bg-accent-50 text-accent-700" : "text-[var(--text-primary)]"
                        }`}
                      >
                        <span className="text-[14px] shrink-0">{b.icon || "📁"}</span>
                        <span className="truncate flex-1">{b.name}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
                          {b.item_count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
              {t("aiPanel.quickActions")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => quickAction("summarize_today")}
                className="btn btn-secondary text-[11px] h-auto py-2 px-3 justify-start"
              >
                {t("aiPanel.summarizeToday")}
              </button>
              <button
                onClick={() => quickAction("summarize_notes")}
                className="btn btn-secondary text-[11px] h-auto py-2 px-3 justify-start"
              >
                {t("aiPanel.organizeNotes")}
              </button>
              <button
                onClick={() => quickAction("project_risks")}
                className="btn btn-secondary text-[11px] h-auto py-2 px-3 justify-start"
              >
                {t("aiPanel.projectRisks")}
              </button>
              <button
                onClick={() => quickAction("general_suggestion")}
                className="btn btn-secondary text-[11px] h-auto py-2 px-3 justify-start"
              >
                {t("aiPanel.generateSuggestions")}
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          >
            {messages.map((m) =>
              m.content ? (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                      m.role === "user"
                        ? "bg-accent-500 text-white"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              ) : null
            )}
            {loading && !messages[messages.length - 1]?.content && (
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

          <div className="border-t border-[var(--border)] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                  lastCompositionEndAtRef.current = Date.now();
                  pendingSendRef.current = false;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (isComposingRef.current || e.nativeEvent.isComposing) {
                      return;
                    }
                    e.preventDefault();
                    pendingSendRef.current = true;
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    if (Date.now() - lastCompositionEndAtRef.current < 200) {
                      pendingSendRef.current = false;
                      return;
                    }
                    if (isComposingRef.current || e.nativeEvent.isComposing) {
                      pendingSendRef.current = false;
                      return;
                    }
                    if (pendingSendRef.current) {
                      pendingSendRef.current = false;
                      send();
                    }
                  }
                }}
                placeholder={selectedKb
                  ? t("aiPanel.placeholderKb", { name: selectedKb.name })
                  : isWebSearchMode
                  ? t("aiPanel.placeholderWebSearch")
                  : t("aiPanel.placeholderAuto")}
                rows={1}
                className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] outline-none placeholder:text-[var(--text-tertiary)] focus:border-accent-500 focus:ring-2 focus:ring-accent-500/10"
                style={{ maxHeight: "100px" }}
              />
              {loading ? (
                <button
                  onClick={handleStop}
                  className="btn btn-secondary btn-icon"
                  aria-label={t("aiPanel.stopGenerating")}
                  title={t("aiPanel.stopGenerating")}
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-current" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim()}
                  className="btn btn-primary btn-icon"
                  aria-label={t("aiPanel.send")}
                >
                  <Send size={14} />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
              <kbd className="kbd">↵</kbd>
              <span>{t("aiPanel.sendHint")} · </span>
              <kbd className="kbd">⇧↵</kbd>
              <span>{t("aiPanel.newlineHint")} · </span>
              {selectedKb ? (
                <span className="text-accent-600">📚 {t("aiPanel.searchingFrom", { name: selectedKb.name.slice(0, 15) + (selectedKb.name.length > 15 ? "..." : "") })}</span>
              ) : isWebSearchMode ? (
                <span className="text-blue-600">{t("aiPanel.webSearchModeLabel")}</span>
              ) : (
                <span>{t("aiPanel.autoModeLabel")}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
