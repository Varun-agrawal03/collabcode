/**
 * useRoom.js — v2
 *
 * Manages all room state including:
 *   - Multi-file filesystem tree
 *   - Open tabs and active file
 *   - Code sync per file (anti-loop preserved)
 *   - Code execution results
 *   - User presence and chat
 */

import { useState, useEffect, useCallback, useRef } from "react";

export function useRoom(socketRef, roomId, username) {
  // Filesystem: the full tree from server
  const [fs, setFs] = useState(null);
  // activeFileId: which file the editor is showing
  const [activeFileId, setActiveFileId] = useState(null);
  // openTabs: list of fileIds currently open as tabs
  const [openTabs, setOpenTabs] = useState([]);
  // Per-file code cache so tabs don't lose content when switching
  const codeCache = useRef({});
  // Anti-loop: which fileId received a remote update (skip re-emit)
  const remoteUpdateFile = useRef(null);

  const [users, setUsers]         = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [isJoined, setIsJoined]   = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  // Execution state per fileId
  const [runResults, setRunResults] = useState({});
  const [isRunning, setIsRunning]   = useState(false);

  // ── Join room and bind all socket events ────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !roomId || !username) return;

    socket.emit("join-room", { roomId, username });

    socket.on("room-joined", ({ fs: initialFs, activeFileId: afId, user, chatHistory }) => {
      setFs(initialFs);

      // Build initial code cache from the server's filesystem
      const cache = {};
      const walk = (node) => {
        if (node.type === "file") cache[node.id] = node.content;
        (node.children || []).forEach(walk);
      };
      walk(initialFs);
      codeCache.current = cache;

      setActiveFileId(afId);
      setOpenTabs(afId ? [afId] : []);
      setCurrentUser(user);
      setChatMessages(chatHistory || []);
      setIsJoined(true);
    });

    // Another user edited a file
    socket.on("code-update", ({ fileId, code }) => {
      // Update cache
      codeCache.current[fileId] = code;
      remoteUpdateFile.current = fileId;

      // Also update content inside the fs tree so new joiners get fresh data
      setFs(prev => {
        if (!prev) return prev;
        const updated = deepClone(prev);
        const node = findNode(updated, fileId);
        if (node) node.content = code;
        return updated;
      });
    });

    // Filesystem changed (file/folder create/rename/delete/move/upload)
    socket.on("fs-update", ({ fs: newFs }) => {
      // Merge new content into code cache
      const walk = (node) => {
        if (node.type === "file") {
          codeCache.current[node.id] = node.content;
        }
        (node.children || []).forEach(walk);
      };
      walk(newFs);
      setFs(newFs);
    });

    // Another user switched active file
    socket.on("active-file-update", ({ fileId }) => {
      // We don't force our own tab to switch, but we open it
      if (fileId) {
        setOpenTabs(prev => prev.includes(fileId) ? prev : [...prev, fileId]);
      }
    });

    socket.on("users-update",  ({ users }) => setUsers(users));
    socket.on("chat-message",  (msg)        => setChatMessages(prev => [...prev, msg]));

    // Execution result
    socket.on("run-result", (result) => {
      setRunResults(prev => ({ ...prev, [result.fileId]: result }));
      setIsRunning(false);
    });

    return () => {
      socket.off("room-joined");
      socket.off("code-update");
      socket.off("fs-update");
      socket.off("active-file-update");
      socket.off("users-update");
      socket.off("chat-message");
      socket.off("run-result");
    };
  }, [socketRef, roomId, username]);

  // ── Code change (local user typed) ──────────────────────────────────────────
  const handleCodeChange = useCallback((fileId, newCode) => {
    if (remoteUpdateFile.current === fileId) {
      remoteUpdateFile.current = null;
      return; // remote update — don't re-emit
    }
    codeCache.current[fileId] = newCode;
    // Update tree too
    setFs(prev => {
      if (!prev) return prev;
      const updated = deepClone(prev);
      const node = findNode(updated, fileId);
      if (node) node.content = newCode;
      return updated;
    });
    socketRef.current?.emit("code-change", { roomId, fileId, code: newCode });
  }, [socketRef, roomId]);

  // ── Tab management ──────────────────────────────────────────────────────────
  const openFile = useCallback((fileId) => {
    setOpenTabs(prev => prev.includes(fileId) ? prev : [...prev, fileId]);
    setActiveFileId(fileId);
    socketRef.current?.emit("active-file", { roomId, fileId });
  }, [socketRef, roomId]);

  const closeTab = useCallback((fileId) => {
    setOpenTabs(prev => {
      const next = prev.filter(id => id !== fileId);
      if (activeFileId === fileId && next.length > 0) {
        const newActive = next[next.length - 1];
        setActiveFileId(newActive);
        socketRef.current?.emit("active-file", { roomId, fileId: newActive });
      }
      return next;
    });
  }, [activeFileId, socketRef, roomId]);

  // ── FS operations ────────────────────────────────────────────────────────────
  const createNode = useCallback((parentId, name, type) => {
    socketRef.current?.emit("fs-create", { roomId, parentId, name, type });
  }, [socketRef, roomId]);

  const renameNode = useCallback((nodeId, newName) => {
    socketRef.current?.emit("fs-rename", { roomId, nodeId, newName });
  }, [socketRef, roomId]);

  const deleteNode = useCallback((nodeId) => {
    socketRef.current?.emit("fs-delete", { roomId, nodeId });
    // Close tab if open
    setOpenTabs(prev => prev.filter(id => id !== nodeId));
  }, [socketRef, roomId]);

  const moveNode = useCallback((nodeId, newParentId) => {
    socketRef.current?.emit("fs-move", { roomId, nodeId, newParentId });
  }, [socketRef, roomId]);

  // ── Code execution ───────────────────────────────────────────────────────────
  const runCode = useCallback((fileId, language) => {
    const code = codeCache.current[fileId] || "";
    setIsRunning(true);
    socketRef.current?.emit("run-code", { roomId, fileId, code, language });
  }, [socketRef, roomId]);

  // ── Cursor sharing ──────────────────────────────────────────────────────────
  const handleCursorMove = useCallback((cursor, fileId) => {
    socketRef.current?.emit("cursor-move", { roomId, cursor, fileId });
  }, [socketRef, roomId]);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const sendChatMessage = useCallback((text) => {
    if (!text?.trim()) return;
    socketRef.current?.emit("chat-message", { roomId, text });
  }, [socketRef, roomId]);

  return {
    fs, activeFileId, openTabs, codeCache,
    users, chatMessages, isJoined, currentUser,
    runResults, isRunning,
    handleCodeChange, openFile, closeTab,
    createNode, renameNode, deleteNode, moveNode,
    runCode, handleCursorMove, sendChatMessage,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function findNode(root, id) {
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
