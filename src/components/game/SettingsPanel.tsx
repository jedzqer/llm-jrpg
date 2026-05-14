"use client";

import { useEffect, useState, type FormEvent } from "react";

type LlmConfigResponse = {
  databasePath: string;
  llm: {
    providerName: string;
    modelId: string;
    baseURL: string | null;
    hasApiKey: boolean;
  };
};

export type ConfigState = {
  loaded: boolean;
  hasSavedApiKey: boolean;
  modelId: string;
};

type Props = {
  open: boolean;
  onConfigChanged: (state: ConfigState) => void;
};

export function SettingsPanel({ open, onConfigChanged }: Props) {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configNotice, setConfigNotice] = useState<string | null>(null);
  const [databasePath, setDatabasePath] = useState("");
  const [providerName, setProviderName] = useState("openai");
  const [modelId, setModelId] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) throw new Error("读取模型配置失败");

        const data = (await res.json()) as LlmConfigResponse;
        if (cancelled) return;

        setDatabasePath(data.databasePath);
        setProviderName(data.llm.providerName || "openai");
        setModelId(data.llm.modelId || "");
        setBaseURL(data.llm.baseURL || "");
        setHasSavedApiKey(Boolean(data.llm.hasApiKey));
        setConfigLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setConfigError(err instanceof Error ? err.message : "读取模型配置失败");
        setConfigLoaded(true);
      }
    };

    void loadConfig();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    onConfigChanged({ loaded: configLoaded, hasSavedApiKey, modelId });
  }, [configLoaded, hasSavedApiKey, modelId, onConfigChanged]);

  const saveConfig = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setConfigError(null);
    setConfigNotice(null);

    const trimmedProviderName = providerName.trim();
    const trimmedModelId = modelId.trim();
    const trimmedBaseURL = baseURL.trim();
    const trimmedApiKey = apiKey.trim();

    if (!trimmedProviderName || !trimmedModelId) {
      setConfigError("Provider 和模型 ID 不能为空。");
      return;
    }

    if (!trimmedApiKey && !hasSavedApiKey) {
      setConfigError("首次保存时必须提供 API Key。");
      return;
    }

    setConfigSaving(true);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerName: trimmedProviderName,
          modelId: trimmedModelId,
          baseURL: trimmedBaseURL || null,
          apiKey: trimmedApiKey || null,
        }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "保存模型配置失败");

      setHasSavedApiKey(true);
      setApiKey("");
      setConfigNotice("模型配置已保存到应用数据库。");
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "保存模型配置失败");
    } finally {
      setConfigSaving(false);
    }
  };

  return (
    <section
      id="llm-settings"
      className={`config-panel ${open ? "open" : "collapsed"}`}
      aria-hidden={!open}
    >
      <div className="config-panel-heading">
        <div>
          <p className="eyebrow">模型配置</p>
          <h2>在应用内设置 LLM</h2>
        </div>
        {databasePath && <p className="config-meta">数据库：{databasePath}</p>}
      </div>
      <p className="config-help">
        不再从配置文件读取模型信息。配置会直接保存到应用自己的 SQLite 数据库。
      </p>
      {!configLoaded && <p className="chat-empty">正在读取当前模型配置……</p>}
      {configError && <p className="chat-error">配置错误：{configError}</p>}
      {configNotice && <p className="config-success">{configNotice}</p>}
      <form className="config-form" onSubmit={saveConfig}>
        <label className="field">
          <span>Provider 名称</span>
          <input
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            placeholder="openai"
            disabled={!configLoaded || configSaving}
          />
        </label>
        <label className="field">
          <span>模型 ID</span>
          <input
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            placeholder="gpt-4o-mini"
            disabled={!configLoaded || configSaving}
          />
        </label>
        <label className="field field-full">
          <span>Base URL（可选）</span>
          <input
            value={baseURL}
            onChange={(e) => setBaseURL(e.target.value)}
            placeholder="https://api.openai.com/v1"
            disabled={!configLoaded || configSaving}
          />
        </label>
        <label className="field field-full">
          <span>API Key{hasSavedApiKey ? "（留空表示保留现有值）" : ""}</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={hasSavedApiKey ? "输入新 key 以覆盖" : "输入你的 API Key"}
            disabled={!configLoaded || configSaving}
          />
        </label>
        <div className="config-actions">
          <p className="config-status">
            {hasSavedApiKey ? "当前已保存 API Key。" : "当前尚未保存 API Key。"}
          </p>
          <button type="submit" className="button primary" disabled={!configLoaded || configSaving}>
            {configSaving ? "保存中……" : "保存配置"}
          </button>
        </div>
      </form>
    </section>
  );
}
