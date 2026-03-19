/**
 * FileExplorer.js
 *
 * VS Code–style file tree with:
 *   - Expand/collapse folders
 *   - Click to open file in editor
 *   - Right-click context menu (rename, delete)
 *   - New file / new folder buttons
 *   - File upload + folder upload
 *   - Download project as ZIP
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import JSZip from "jszip";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

// File icon map by language
const ICONS = {
  javascript: "🟨", typescript: "🔷", python: "🐍",
  html: "🌐", css: "🎨", json: "📋", markdown: "📝",
  java: "☕", cpp: "⚙️", c: "⚙️", go: "🔵", rust: "🦀",
  ruby: "💎", shell: "🖥️", sql: "🗄️", xml: "📄",
  yaml: "📄", plaintext: "📄", folder: "📁", folderOpen: "📂",
};

function fileIcon(node) {
  if (node.type === "folder") return null; // handled separately
  return ICONS[node.language] || "📄";
}

// ── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, node, onRename, onDelete, onCreate, onClose }) {
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div className="ctx-menu" style={{ top: y, left: x }} onMouseDown={e => e.stopPropagation()}>
      {node.type === "folder" && (
        <>
          <div className="ctx-item" onClick={() => { onCreate(node.id, "file"); onClose(); }}>
            📄 New File
          </div>
          <div className="ctx-item" onClick={() => { onCreate(node.id, "folder"); onClose(); }}>
            📁 New Folder
          </div>
          <div className="ctx-divider" />
        </>
      )}
      <div className="ctx-item" onClick={() => { onRename(node); onClose(); }}>✏️ Rename</div>
      <div className="ctx-item danger" onClick={() => { onDelete(node.id); onClose(); }}>🗑️ Delete</div>
    </div>
  );
}

// ── Single Tree Node ──────────────────────────────────────────────────────────
function TreeNode({ node, depth, activeFileId, openTabs, onOpen, onRename, onDelete, onCreate }) {
  const [expanded, setExpanded] = useState(depth < 2); // auto-expand top levels
  const [ctxMenu, setCtxMenu]   = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(node.name);
  const renameRef = useRef(null);

  useEffect(() => { if (renaming) renameRef.current?.select(); }, [renaming]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const handleRenameStart = (n) => {
    setRenameVal(n.name);
    setRenaming(true);
  };

  const commitRename = () => {
    if (renameVal.trim() && renameVal !== node.name) {
      onRename(node.id, renameVal.trim());
    }
    setRenaming(false);
  };

  const isActive = activeFileId === node.id;
  const isOpen   = openTabs?.includes(node.id);
  const indent   = depth * 14;

  if (node.type === "folder") {
    return (
      <div>
        <div
          className={`tree-row folder`}
          style={{ paddingLeft: indent + 4 }}
          onClick={() => setExpanded(v => !v)}
          onContextMenu={handleContextMenu}
        >
          <span className="tree-arrow">{expanded ? "▾" : "▸"}</span>
          <span className="tree-icon">{expanded ? "📂" : "📁"}</span>
          {renaming ? (
            <input
              ref={renameRef}
              className="rename-input"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="tree-name">{node.name}</span>
          )}
        </div>

        {expanded && node.children?.map(child => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            activeFileId={activeFileId}
            openTabs={openTabs}
            onOpen={onOpen}
            onRename={onRename}
            onDelete={onDelete}
            onCreate={onCreate}
          />
        ))}

        {ctxMenu && (
          <ContextMenu
            x={ctxMenu.x} y={ctxMenu.y} node={node}
            onRename={handleRenameStart}
            onDelete={onDelete}
            onCreate={onCreate}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    );
  }

  // File node
  return (
    <div>
      <div
        className={`tree-row file ${isActive ? "active" : ""} ${isOpen ? "open" : ""}`}
        style={{ paddingLeft: indent + 20 }}
        onClick={() => onOpen(node.id)}
        onContextMenu={handleContextMenu}
      >
        <span className="tree-icon">{fileIcon(node)}</span>
        {renaming ? (
          <input
            ref={renameRef}
            className="rename-input"
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(false); }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="tree-name">{node.name}</span>
        )}
        {isOpen && <span className="open-dot" />}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x} y={ctxMenu.y} node={node}
          onRename={handleRenameStart}
          onDelete={onDelete}
          onCreate={onCreate}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

// ── New File/Folder Input ─────────────────────────────────────────────────────
function NewItemInput({ type, parentId, onCreate, onCancel }) {
  const [name, setName] = useState("");
  const ref = useRef(null);

  useEffect(() => ref.current?.focus(), []);

  const commit = () => {
    if (name.trim()) onCreate(parentId, name.trim(), type);
    onCancel();
  };

  return (
    <div className="new-item-row">
      <span className="tree-icon">{type === "folder" ? "📁" : "📄"}</span>
      <input
        ref={ref}
        className="new-item-input"
        placeholder={type === "folder" ? "folder name" : "filename.js"}
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); }}
      />
    </div>
  );
}

// ── Main FileExplorer ─────────────────────────────────────────────────────────
function FileExplorer({ fs, roomId, activeFileId, openTabs, onOpen, onCreate, onRename, onDelete }) {
  const [newItem, setNewItem]     = useState(null); // { type, parentId }
  const [uploading, setUploading] = useState(false);
  const fileInputRef   = useRef(null);
  const folderInputRef = useRef(null);

  // ── Upload files ────────────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const formData = new FormData();
    for (const file of files) {
      // Use relative path for folder uploads, just filename for single files
      const rel = file.webkitRelativePath || file.name;
      formData.append(encodeURIComponent(rel), file);
    }
    try {
      await fetch(`${SERVER_URL}/room/${roomId}/upload`, { method: "POST", body: formData });
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setUploading(false);
    e.target.value = "";
  }, [roomId]);

  // ── Download project as ZIP ─────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    const zip = new JSZip();

    function addToZip(node, folder) {
      if (node.type === "file") {
        folder.file(node.name, node.content || "");
      } else {
        const sub = folder.folder(node.name);
        (node.children || []).forEach(c => addToZip(c, sub));
      }
    }

    // Start from root's children (skip the root "project" wrapper folder)
    const root = fs;
    const rootFolder = zip.folder(root.name);
    (root.children || []).forEach(c => addToZip(c, rootFolder));

    const blob = await zip.generateAsync({ type: "blob" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `${root.name}.zip`; a.click();
    URL.revokeObjectURL(url);
  }, [fs]);

  if (!fs) return <div className="explorer-empty">Loading...</div>;

  return (
    <div className="file-explorer">
      {/* Header */}
      <div className="explorer-header">
        <span className="explorer-title">EXPLORER</span>
        <div className="explorer-actions">
          <button className="exp-btn" title="New File" onClick={() => setNewItem({ type: "file", parentId: fs.id })}>📄+</button>
          <button className="exp-btn" title="New Folder" onClick={() => setNewItem({ type: "folder", parentId: fs.id })}>📁+</button>
          <button className="exp-btn" title="Upload Files" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "⏳" : "⬆"}
          </button>
          <button className="exp-btn" title="Upload Folder" onClick={() => folderInputRef.current?.click()} disabled={uploading}>
            {uploading ? "⏳" : "📂⬆"}
          </button>
          <button className="exp-btn" title="Download as ZIP" onClick={handleDownload}>⬇ZIP</button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileUpload} />
      <input ref={folderInputRef} type="file" style={{ display: "none" }}
        {...{ webkitdirectory: "", directory: "" }}
        onChange={handleFileUpload}
      />

      {/* Tree */}
      <div className="tree-root">
        {/* Root label */}
        <div className="tree-root-label">
          <span>📂</span>
          <span>{fs.name}</span>
        </div>

        {/* New item input at root level */}
        {newItem && newItem.parentId === fs.id && (
          <NewItemInput
            type={newItem.type}
            parentId={newItem.parentId}
            onCreate={onCreate}
            onCancel={() => setNewItem(null)}
          />
        )}

        {fs.children?.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            activeFileId={activeFileId}
            openTabs={openTabs}
            onOpen={onOpen}
            onRename={onRename}
            onDelete={onDelete}
            onCreate={(parentId, name, type) => onCreate(parentId, name, type)}
          />
        ))}
      </div>
    </div>
  );
}

export default FileExplorer;
