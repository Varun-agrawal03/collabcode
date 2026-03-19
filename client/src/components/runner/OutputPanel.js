/**
 * OutputPanel.js
 *
 * Displays execution output below the editor.
 *
 * States:
 *   idle     → "Press ▶ Run or Ctrl+Enter"
 *   running  → spinner + language-specific loading message
 *   result   → stdout (green), stderr (red), elapsed time
 *   HTML     → live iframe preview tab
 */

import React, { useState } from "react";

const LANG_LOADING = {
  python:     "Loading Python runtime (Pyodide)…",
  javascript: "Running JavaScript…",
  typescript: "Transpiling & running TypeScript…",
  html:       "Rendering HTML preview…",
};

const LANG_COLOR = {
  javascript: "#f7df1e",
  typescript: "#3178c6",
  python:     "#4ade80",
  html:       "#ff6b35",
};

function OutputPanel({ result, language, isRunning, code, onClose }) {
  const [tab, setTab] = useState("output");
  const isHtml = result?.output === "__HTML_PREVIEW__";

  return (
    <div className="output-panel">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="output-header">
        <div className="output-tabs">
          <button
            className={`out-tab ${tab === "output" ? "active" : ""}`}
            onClick={() => setTab("output")}
          >
            📋 Console
          </button>
          {(isHtml || (result && language === "html")) && (
            <button
              className={`out-tab ${tab === "preview" ? "active" : ""}`}
              onClick={() => setTab("preview")}
            >
              🌐 Preview
            </button>
          )}
        </div>

        <div className="output-meta">
          {result && !isRunning && (
            <>
              <span className={`status-badge ${result.success ? "success" : "error"}`}>
                {result.success ? "✓ OK" : "✗ Error"}
              </span>
              <span className="elapsed">{result.elapsed}ms</span>
              {result.runtime && (
                <span className="runtime-badge">{result.runtime}</span>
              )}
            </>
          )}
          {language && (
            <span
              className="lang-dot"
              style={{ background: LANG_COLOR[language] || "#888" }}
              title={language}
            />
          )}
          <button className="out-close-btn" onClick={onClose} title="Close output">✕</button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="output-body">
        {/* Running state */}
        {isRunning && (
          <div className="output-loading">
            <div className="output-spinner" />
            <span>{LANG_LOADING[language] || "Running…"}</span>
            {language === "python" && (
              <span className="pyodide-note">
                First Python run loads ~10MB WASM runtime from CDN. Subsequent runs are instant.
              </span>
            )}
          </div>
        )}

        {/* Idle state */}
        {!isRunning && !result && (
          <div className="output-idle">
            Press <kbd>▶ Run</kbd> or <kbd>Ctrl+Enter</kbd> to execute
          </div>
        )}

        {/* Output tab */}
        {!isRunning && result && tab === "output" && (
          <>
            {result.output && result.output !== "__HTML_PREVIEW__" && (
              <pre className="out-stdout">{result.output}</pre>
            )}
            {isHtml && (
              <pre className="out-stdout out-dim">
                HTML rendered — switch to Preview tab →
              </pre>
            )}
            {result.errors && (
              <pre className="out-stderr">
                <span className="err-label">⚠ Error</span>{"\n"}{result.errors}
              </pre>
            )}
            {!result.output && !result.errors && (
              <span className="out-dim">Program exited with no output.</span>
            )}
          </>
        )}

        {/* HTML Preview tab */}
        {!isRunning && tab === "preview" && (
          <iframe
            className="html-preview"
            title="HTML Preview"
            sandbox="allow-scripts allow-same-origin"
            srcDoc={code}
          />
        )}
      </div>
    </div>
  );
}

export default OutputPanel;
