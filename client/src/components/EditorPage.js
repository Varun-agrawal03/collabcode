/**
 * EditorPage.js — v2 final
 *
 * Layout (VS Code–inspired):
 *
 *  ┌─── Toolbar (run, share, toggles) ───────────────────────────────────────┐
 *  │ [Explorer] │ [tabs...                                      ] │ [Sidebar] │
 *  │            │ ┌─ Monaco Editor ──────────────────────────────┐│           │
 *  │  file tree │ │                                              ││ Users /   │
 *  │            │ │                                              ││ Chat      │
 *  │            │ └──────────────────────────────────────────────┘│           │
 *  │            │ ┌─ Output Panel (console / HTML preview) ───────┐│           │
 *  │            │ │                                              ││           │
 *  │            │ └──────────────────────────────────────────────┘│           │
 *  └────────────┴──────────────────────────────────────────────────┴───────────┘
 *
 * Execution runs fully client-side via useCodeRunner:
 *   JS/TS  → Web Worker sandbox
 *   Python → Pyodide (WASM, loaded lazily from CDN)
 *   HTML   → iframe srcDoc
 */

import React, { useRef, useCallback, useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { useSocket }      from "../hooks/useSocket";
import { useRoom }        from "../hooks/useRoom";
import { useCodeRunner }  from "../hooks/useCodeRunner";
import FileExplorer       from "./filesystem/FileExplorer";
import FileTabs           from "./tabs/FileTabs";
import OutputPanel        from "./runner/OutputPanel";
import UserPresence       from "./UserPresence";
import ChatPanel          from "./ChatPanel";
import Toolbar            from "./Toolbar";

function findNode(root, id) {
  if (!root || !id) return null;
  if (root.id === id) return root;
  for (const c of root.children || []) { const f = findNode(c, id); if (f) return f; }
  return null;
}

const RUNNABLE = ["javascript", "typescript", "python", "html"];

export default function EditorPage({ roomId, username, onLeave }) {
  const socketRef = useSocket();
  const editorRef = useRef(null);

  const [outputOpen,   setOutputOpen]   = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [sidebarTab,   setSidebarTab]   = useState("users");
  const [explorerOpen, setExplorerOpen] = useState(true);

  // Room state (filesystem, tabs, chat, presence)
  const {
    fs, activeFileId, openTabs, codeCache,
    users, chatMessages, isJoined, currentUser,
    handleCodeChange, openFile, closeTab,
    createNode, renameNode, deleteNode, moveNode,
    handleCursorMove, sendChatMessage,
  } = useRoom(socketRef, roomId, username);

  // Client-side code execution
  const { run, results: runResults, running } = useCodeRunner();

  // Derived
  const activeNode   = findNode(fs, activeFileId);
  const activeCode   = activeFileId ? (codeCache.current[activeFileId] ?? "") : "";
  const activeResult = activeFileId ? runResults[activeFileId] : null;
  const isRunning    = activeFileId ? !!running[activeFileId] : false;
  const canRun       = !!activeNode && RUNNABLE.includes(activeNode.language);

  // ── Sync Monaco content when active file changes ─────────────────────────────
  useEffect(() => {
    if (!editorRef.current || !activeFileId) return;
    const current = editorRef.current.getValue();
    const target  = codeCache.current[activeFileId] ?? "";
    if (current !== target) editorRef.current.setValue(target);
  }, [activeFileId]);  // eslint-disable-line

  // ── Receive remote code edits directly into Monaco ───────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handler = ({ fileId, code }) => {
      if (editorRef.current && fileId === activeFileId) {
        const pos = editorRef.current.getPosition();
        editorRef.current.setValue(code);
        if (pos) editorRef.current.setPosition(pos);
      }
    };
    socket.on("code-update", handler);
    return () => socket.off("code-update", handler);
  }, [socketRef, activeFileId]);

  // ── Monaco mount ──────────────────────────────────────────────────────────────
  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
    let cursorTimer = null;
    editor.onDidChangeCursorPosition(e => {
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => {
        handleCursorMove({ line: e.position.lineNumber, column: e.position.column }, activeFileId);
      }, 120);
    });
    editor.focus();
  }, [handleCursorMove, activeFileId]);

  // ── Run button ────────────────────────────────────────────────────────────────
  const handleRun = useCallback(() => {
    if (!activeNode || !activeFileId || !canRun) return;
    setOutputOpen(true);
    run(activeFileId, activeNode.language, codeCache.current[activeFileId] ?? "");
  }, [activeNode, activeFileId, canRun, run, codeCache]);

  // ── Keyboard shortcut: Ctrl/Cmd+Enter to run ─────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canRun) {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canRun, handleRun]);

  if (!isJoined) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Connecting to room <strong>{roomId}</strong>…</p>
      </div>
    );
  }

  return (
    <div className="editor-layout">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <Toolbar
        roomId={roomId}
        activeNode={activeNode}
        userCount={users.length}
        currentUser={currentUser}
        canRun={canRun}
        isRunning={isRunning}
        onRun={handleRun}
        onLeave={onLeave}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onToggleExplorer={() => setExplorerOpen(v => !v)}
        onToggleOutput={() => setOutputOpen(v => !v)}
        isSidebarOpen={sidebarOpen}
        isExplorerOpen={explorerOpen}
        isOutputOpen={outputOpen}
      />

      <div className="editor-body">
        {/* ── File Explorer ──────────────────────────────────────────────── */}
        {explorerOpen && (
          <div className="explorer-pane">
            <FileExplorer
              fs={fs}
              roomId={roomId}
              activeFileId={activeFileId}
              openTabs={openTabs}
              onOpen={openFile}
              onCreate={createNode}
              onRename={renameNode}
              onDelete={deleteNode}
            />
          </div>
        )}

        {/* ── Center column: Tabs + Editor + Output ──────────────────────── */}
        <div className="center-pane">
          <FileTabs
            openTabs={openTabs}
            activeFileId={activeFileId}
            fs={fs}
            onSwitch={openFile}
            onClose={closeTab}
          />

          <div className="editor-area">
            {activeNode ? (
              <Editor
                key={activeFileId}
                height="100%"
                language={activeNode.language}
                defaultValue={activeCode}
                onChange={val => handleCodeChange(activeFileId, val ?? "")}
                onMount={handleEditorMount}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono','Fira Code',monospace",
                  fontLigatures: true,
                  minimap: { enabled: window.innerWidth > 1280 },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  lineNumbers: "on",
                  renderLineHighlight: "all",
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  smoothScrolling: true,
                  padding: { top: 14, bottom: 14 },
                  tabSize: 2,
                  automaticLayout: true,
                  bracketPairColorization: { enabled: true },
                  guides: { bracketPairs: true },
                }}
              />
            ) : (
              <div className="no-file-open">
                <div className="no-file-icon">⌨</div>
                <p>Open a file from the explorer to start editing</p>
                <p className="no-file-hint">Right-click the tree to create files &amp; folders</p>
              </div>
            )}
          </div>

          {outputOpen && (
            <div className="output-pane">
              <OutputPanel
                result={activeResult}
                language={activeNode?.language}
                isRunning={isRunning}
                code={activeCode}
                onClose={() => setOutputOpen(false)}
              />
            </div>
          )}
        </div>

        {/* ── Right Sidebar ──────────────────────────────────────────────── */}
        {sidebarOpen && (
          <div className="sidebar">
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${sidebarTab === "users" ? "active" : ""}`}
                onClick={() => setSidebarTab("users")}
              >👥 {users.length}</button>
              <button
                className={`sidebar-tab ${sidebarTab === "chat" ? "active" : ""}`}
                onClick={() => setSidebarTab("chat")}
              >💬 Chat</button>
            </div>
            <div className="sidebar-content">
              {sidebarTab === "users"
                ? <UserPresence users={users} currentUser={currentUser} />
                : <ChatPanel messages={chatMessages} currentUser={currentUser} onSend={sendChatMessage} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
