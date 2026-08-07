import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api } from "../api";
import { useAppStore } from "../store";
import {
  Sparkles,
  Key,
  Globe,
  Check,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Download,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "../utils";

// 预设模型配置
const PRESET_MODELS = [
  {
    id: "doubao-free",
    name: "豆包",
    provider: "火山引擎",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-pro-32k",
    description: "免费使用，有速率限制",
  },
  {
    id: "openai",
    name: "OpenAI",
    provider: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    description: "GPT-4o / GPT-4o-mini / GPT-4",
  },
  {
    id: "claude",
    name: "Claude",
    provider: "Anthropic",
    baseURL: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    description: "Claude 3.5 Sonnet / Claude 3 Opus",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    provider: "DeepSeek",
    baseURL: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    description: "性价比高，适合编程",
  },
  {
    id: "qwen",
    name: "通义千问",
    provider: "阿里云",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-turbo",
    description: "阿里云百炼 API",
  },
  {
    id: "custom",
    name: "自定义",
    provider: "中转 API",
    baseURL: "",
    model: "",
    description: "接入其他兼容 OpenAI 的 API",
  },
];

// 模型 Logo SVG 组件
function ModelLogo({ provider, size = 24 }: { provider: string; size?: number }) {
  const logos: Record<string, React.ReactNode> = {
    "火山引擎": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#FF6B35" />
        <path d="M12 6C9 6 7 8.5 7 11c0 1.5.7 2.8 1.8 3.7L12 18l3.2-3.3c1.1-.9 1.8-2.2 1.8-3.7 0-2.5-2-5-5-5z" fill="white"/>
        <circle cx="12" cy="10" r="2" fill="#FF6B35"/>
      </svg>
    ),
    "OpenAI": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#10A37F" />
        <path d="M15 8.5c0-2-1.5-3-3-3s-3 1-3 3c0 1.5 1 2 2 2.5l1.5 1c1 .5 1.5 1 1.5 2 0 1.5-1.5 2.5-3 2.5s-3-1-3-2.5" stroke="white" strokeWidth="1.5" fill="none"/>
        <circle cx="12" cy="16" r="1.5" fill="white"/>
      </svg>
    ),
    "Anthropic": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#CC785C" />
        <path d="M8 10c0-2 2-3 4-3s4 1 4 3c0 1.5-1 2-2 2.5L17 13c1 .5 2 1 2 2 0 2-2 3-4 3s-4-1-4-3c0-1.5 1-2 2-2.5L10 11c-1-.5-2-1-2-2z" stroke="white" strokeWidth="1.2" fill="none"/>
      </svg>
    ),
    "DeepSeek": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#24283B" />
        <path d="M8 8l8 8M16 8l-8 8" stroke="#7AA2F7" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="12" cy="12" r="3" fill="#7AA2F7"/>
      </svg>
    ),
    "阿里云": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#FF6A00" />
        <path d="M12 7v5l3 3" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        <path d="M9 9.5c0-1 .5-2 1.5-2.5S13 6.5 13 7.5s-.5 2-1.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      </svg>
    ),
    "中转 API": (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#6366F1" />
        <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  };

  return <div className="flex-shrink-0">{logos[provider] || logos["中转 API"]}</div>;
}

export function AISettings() {
  const [selectedModel, setSelectedModel] = useState("doubao-free");
  const [baseURL, setBaseURL] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testMessage, setTestMessage] = useState("");
  const [connected, setConnected] = useState(false);

  // 获取模型列表
  const [fetchingModels, setFetchingModels] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const savedModel = await api.getSetting("ai_model_id");
      const savedBaseURL = await api.getSetting("ai_base_url");
      const savedModelName = await api.getSetting("ai_model");
      const savedApiKey = await api.getSetting("ai_api_key");
      const savedConnected = await api.getSetting("ai_connected");

      if (savedModel) setSelectedModel(savedModel);
      if (savedBaseURL) setBaseURL(savedBaseURL);
      if (savedModelName) setModel(savedModelName);
      if (savedApiKey) setApiKey(savedApiKey);
      if (savedConnected === "true") setConnected(true);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveSettings() {
    if (!connected) {
      setTestResult("error");
      setTestMessage("请先测试连接，连接成功后再保存");
      return;
    }

    setSaving(true);
    try {
      await api.setSetting("ai_model_id", selectedModel);
      await api.setSetting("ai_base_url", baseURL);
      await api.setSetting("ai_model", model);
      await api.setSetting("ai_api_key", apiKey);
      await api.setSetting("ai_connected", "true");
      setConnected(true);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    if (!baseURL || !apiKey) {
      setTestResult("error");
      setTestMessage("请先填写 Base URL 和 API Key");
      return;
    }

    setTesting(true);
    setTestResult(null);
    setTestMessage("");

    try {
      // 通过后端代理请求，避免 CORS 问题
      const result = await invoke<string>('test_ai_connection', {
        config: {
          base_url: baseURL,
          api_key: apiKey,
          model: model || undefined,
        }
      });

      setTestResult("success");
      setTestMessage("连接成功！可以保存使用了");
      setConnected(true);
    } catch (e: any) {
      setTestResult("error");
      setTestMessage(e.toString());
      setConnected(false);
    } finally {
      setTesting(false);
    }
  }

  async function fetchModels() {
    if (!baseURL || !apiKey) {
      setTestResult("error");
      setTestMessage("请先填写 Base URL 和 API Key");
      return;
    }

    setFetchingModels(true);
    try {
      // 通过后端代理请求，避免 CORS 问题
      const models = await invoke<string[]>('fetch_ai_models', {
        config: {
          base_url: baseURL,
          api_key: apiKey,
          model: model || undefined,
        }
      });

      if (models.length > 0) {
        setAvailableModels(models);
        setModel(models[0]);
        setShowModelDropdown(true);
        setTestResult(null);
      } else {
        setTestResult("error");
        setTestMessage("未找到可用模型");
      }
    } catch (e: any) {
      setTestResult("error");
      setTestMessage("获取模型失败：" + e.toString());
    } finally {
      setFetchingModels(false);
    }
  }

  function selectPreset(presetId: string) {
    // 只切换模型配置，不清空用户已填的 API Key
    const preset = PRESET_MODELS.find((m) => m.id === presetId);
    if (preset) {
      setSelectedModel(presetId);
      setBaseURL(preset.baseURL);
      setModel(preset.model);
      setConnected(false); // 切换后需要重新测试
      setTestResult(null);
    }
  }

  const currentPreset = PRESET_MODELS.find((m) => m.id === selectedModel);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[800px] px-8 py-8">
        <div className="mb-8">
          <h1 className="h-display">AI 设置</h1>
          <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
            配置 AI 模型以启用智能助手功能
          </p>
        </div>

        {/* 模型选择 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Sparkles size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">选择模型</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                选择或自定义 AI 模型
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {PRESET_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => selectPreset(m.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                  selectedModel === m.id
                    ? "border-accent-500 bg-accent-50/30"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]"
                )}
              >
                <ModelLogo provider={m.provider} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{m.name}</span>
                    {selectedModel === m.id && (
                      <Check size={14} className="text-accent-500" />
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                    {m.provider}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* API 配置 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-accent-50 flex items-center justify-center text-accent-500">
              <Key size={14} />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold">API 配置</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                输入你的 API 凭证
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">
                Base URL
              </label>
              <input
                value={baseURL}
                onChange={(e) => {
                  setBaseURL(e.target.value);
                  setConnected(false);
                }}
                className="input"
                placeholder={
                  currentPreset?.baseURL || "https://api.example.com/v1"
                }
              />
              {currentPreset && currentPreset.id !== "custom" && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                  <Globe size={12} />
                  <span>{currentPreset.provider}</span>
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] mb-1 block">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setConnected(false);
                }}
                className="input"
                placeholder="sk-..."
              />
              <div className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
                你的 API Key 仅存储在本地，不会同步到云端
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-[var(--text-tertiary)]">
                  模型名称
                </label>
                <button
                  onClick={fetchModels}
                  disabled={fetchingModels || !baseURL || !apiKey}
                  className="btn btn-secondary text-[11px] h-7 px-2"
                >
                  {fetchingModels ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}
                  获取模型
                </button>
              </div>
              
              {availableModels.length > 0 ? (
                <div className="relative">
                  <button
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    className="input w-full flex items-center justify-between"
                  >
                    <span>{model || "选择模型"}</span>
                    {showModelDropdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {showModelDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {availableModels.map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setModel(m);
                            setShowModelDropdown(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-secondary)]",
                            model === m && "bg-accent-50 text-accent-500"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <input
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setConnected(false);
                  }}
                  className="input"
                  placeholder={currentPreset?.model || "gpt-4o-mini"}
                />
              )}
              
              {currentPreset && currentPreset.id !== "custom" && (
                <div className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
                  推荐: {currentPreset.model}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 测试与保存 */}
        <section className="card p-5 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold">连接状态</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">
                {connected ? (
                  <span className="text-success flex items-center gap-1">
                    <Check size={12} /> 已连接
                  </span>
                ) : (
                  "请测试连接后保存"
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={testConnection}
                disabled={testing || !baseURL || !apiKey}
                className={cn(
                  "btn",
                  connected ? "btn-secondary" : "btn-primary"
                )}
              >
                {testing ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : connected ? (
                  <Check size={14} />
                ) : (
                  <Sparkles size={14} />
                )}
                {connected ? "重新测试" : "测试连接"}
              </button>
              <button
                onClick={saveSettings}
                disabled={saving || !connected}
                className={cn(
                  "btn",
                  connected ? "btn-primary" : "btn-secondary opacity-50"
                )}
              >
                {saving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                保存
              </button>
            </div>
          </div>

          {testResult && (
            <div
              className={cn(
                "mt-4 p-3 rounded-lg flex items-center gap-2",
                testResult === "success"
                  ? "bg-green-50 text-success"
                  : "bg-red-50 text-error"
              )}
            >
              {testResult === "success" ? (
                <Check size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span className="text-[13px]">{testMessage}</span>
            </div>
          )}
        </section>

        {/* 使用说明 */}
        <section className="card p-5">
          <h2 className="text-[14px] font-semibold mb-3">使用说明</h2>
          <div className="space-y-3 text-[12px] text-[var(--text-secondary)]">
            <div className="flex items-start gap-2">
              <span className="text-accent-500">1.</span>
              <span>
                <strong>豆包 (免费)</strong>：使用字节跳动火山引擎 API，有免费额度限制，适合日常使用。
                需要在{" "}
                <a
                  href="https://console.volcengine.com/ark"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-500 hover:underline inline-flex items-center gap-1"
                >
                  火山引擎控制台 <ExternalLink size={12} />
                </a>{" "}
                获取 API Key。
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-accent-500">2.</span>
              <span>
                <strong>OpenAI / Claude</strong>：需要官方 API Key，可在官网购买信用额度。
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-accent-500">3.</span>
              <span>
                <strong>中转 API</strong>：如使用第三方代理服务（如 NextChat、Nexus 等），
                请填写代理提供的中转地址和 API Key。
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-accent-500">4.</span>
              <span>
                <strong>安全提醒</strong>：请勿将 API Key 泄露给他人，定期更换 Key 以保障安全。
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
