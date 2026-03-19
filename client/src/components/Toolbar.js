/**
 * Toolbar.js — v2
 * Adds: Run button (language-aware), explorer toggle, output toggle.
 */

import React, { useState } from "react";

const RUN_LANGS = {
  javascript: { label: "Run JS",     color: "#f7df1e", bg: "#3a3200" },
  typescript: { label: "Run TS",     color: "#3178c6", bg: "#001a38" },
  python:     { label: "Run Python", color: "#4ade80", bg: "#003318" },
  html:       { label: "Preview",    color: "#ff6b35", bg: "#3a1500" },
};

function Toolbar({
  roomId, activeNode, userCount, currentUser,
  canRun, isRunning, onRun, onLeave,
  onToggleSidebar, onToggleExplorer, onToggleOutput,
  isSidebarOpen, isExplorerOpen, isOutputOpen,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const url = `${window.location.origin}${window.location.pathname}#${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const runMeta = activeNode ? RUN_LANGS[activeNode.language] : null;

  return (
    <div className="toolbar">
      {/* Left */}
      <div className="toolbar-left">
        <span className="toolbar-logo">⌨ CollabCode</span>
        <div className="room-badge">
          <span className="room-label">ROOM</span>
          <span className="room-id">{roomId}</span>
        </div>

        {/* View toggles */}
        <div className="toolbar-toggles">
          <button
            className={`toolbar-btn icon-btn ${isExplorerOpen ? "active" : ""}`}
            onClick={onToggleExplorer}
            title="Toggle File Explorer"
          >⊞</button>
          <button
            className={`toolbar-btn icon-btn ${isOutputOpen ? "active" : ""}`}
            onClick={onToggleOutput}
            title="Toggle Output Panel"
          >▤</button>
        </div>
      </div>

      {/* Center: active file name */}
      <div className="toolbar-center">
        {activeNode && (
          <span className="active-filename">
            {activeNode.name}
          </span>
        )}
      </div>

      {/* Right */}
      <div className="toolbar-right">
        {/* Run button */}
        {canRun && runMeta && (
          <button
            className={`run-btn ${isRunning ? "running" : ""}`}
            style={{ "--run-color": runMeta.color, "--run-bg": runMeta.bg }}
            onClick={onRun}
            disabled={isRunning}
            title={`Execute ${activeNode?.name}`}
          >
            {isRunning ? (
              <><span className="run-spinner" /> Running...</>
            ) : (
              <><span className="run-icon">▶</span> {runMeta.label}</>
            )}
          </button>
        )}

        {/* Presence */}
        <div className="user-count-badge">
          <span className="pulse-dot" />
          {userCount} online
        </div>

        {currentUser && (
          <div className="current-user-chip" style={{ borderColor: currentUser.color }}>
            <span className="user-dot" style={{ background: currentUser.color }} />
            {currentUser.username}
          </div>
        )}

        <button className="toolbar-btn" onClick={handleCopy}>
          {copied ? "✓ Copied" : "🔗 Share"}
        </button>

        <button
          className={`toolbar-btn ${isSidebarOpen ? "active" : ""}`}
          onClick={onToggleSidebar}
          title="Toggle Sidebar"
        >☰</button>

        <button className="toolbar-btn danger" onClick={onLeave}>✕ Leave</button>
      </div>
    </div>
  );
}

export default Toolbar;
