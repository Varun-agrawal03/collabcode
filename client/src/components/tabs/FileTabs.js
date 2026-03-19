/**
 * FileTabs.js
 * Multi-file tab bar similar to VS Code.
 * Shows open files; clicking switches active file; × closes tab.
 */

import React from "react";

const LANG_ICONS = {
  javascript: "JS", typescript: "TS", python: "PY",
  html: "HT", css: "CS", json: "{}", markdown: "MD",
  java: "JV", cpp: "C+", c: "C", go: "GO", rust: "RS",
  ruby: "RB", shell: "SH", sql: "SQ",
};

function FileTabs({ openTabs, activeFileId, fs, onSwitch, onClose }) {
  if (!fs || openTabs.length === 0) return null;

  // Build id→node index
  const index = {};
  const walk = (node) => {
    index[node.id] = node;
    (node.children || []).forEach(walk);
  };
  walk(fs);

  return (
    <div className="file-tabs">
      {openTabs.map(fileId => {
        const node = index[fileId];
        if (!node) return null;
        const isActive = fileId === activeFileId;
        const tag = LANG_ICONS[node.language] || "  ";

        return (
          <div
            key={fileId}
            className={`file-tab ${isActive ? "active" : ""}`}
            onClick={() => onSwitch(fileId)}
          >
            <span className="tab-lang-badge">{tag}</span>
            <span className="tab-name">{node.name}</span>
            <button
              className="tab-close"
              onClick={e => { e.stopPropagation(); onClose(fileId); }}
              title="Close tab"
            >×</button>
          </div>
        );
      })}
    </div>
  );
}

export default FileTabs;
