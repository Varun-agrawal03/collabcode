/**
 * CollabCode Server — v2
 *
 * Features:
 *   • Multi-file room filesystem (files/folders as a tree)
 *   • File CRUD via Socket events (create, rename, delete, move)
 *   • Code execution via execution/runner.js (JS, TS, Python, C++, Java)
 *     — Client also runs JS/TS/Python/HTML in-browser via useCodeRunner.js
 *     — Server execution is the fallback + handles C++/Java
 *   • REST upload endpoint (single + folder upload via multipart)
 *   • Filesystem broadcast to all room members on every change
 */

const express    = require("express");
const http       = require("http");
const { Server } = require("socket.io");
const cors       = require("cors");
const { v4: uuidv4 } = require("uuid");
const multer     = require("multer");
const path       = require("path");
const { executeCode } = require("./execution/runner");

const app    = express();
const server = http.createServer(app);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

// ─── In-Memory Store ──────────────────────────────────────────────────────────
const rooms = new Map();

// ─── Default starter filesystem ───────────────────────────────────────────────
function makeDefaultFS() {
  const rootId   = uuidv4();
  const mainId   = uuidv4();
  const readmeId = uuidv4();
  const srcId    = uuidv4();
  const utilsId  = uuidv4();

  const root = {
    id: rootId, name: "project", type: "folder", parentId: null,
    children: [
      {
        id: mainId, name: "main.js", type: "file",
        language: "javascript", parentId: rootId, children: [],
        content: `// Welcome to CollabCode v2! 🚀
// Click ▶ Run to execute this file.

function greet(name) {
  return \`Hello, \${name}! Happy collaborative coding.\`;
}

console.log(greet("World"));
console.log("Try editing and running together!");
`,
      },
      {
        id: readmeId, name: "README.md", type: "file",
        language: "markdown", parentId: rootId, children: [],
        content: `# My CollabCode Project

## Features
- 📁 Multi-file project tree (left sidebar)
- ▶ Run JS, Python, HTML in-browser
- 📤 Upload files or whole folders
- 📦 Download project as ZIP
- 👥 Real-time collaborative editing
`,
      },
      {
        id: srcId, name: "src", type: "folder", parentId: rootId,
        children: [
          {
            id: utilsId, name: "utils.js", type: "file",
            language: "javascript", parentId: srcId, children: [],
            content: `// Utility helpers

function add(a, b) { return a + b; }
function multiply(a, b) { return a * b; }

console.log("2 + 3 =", add(2, 3));
console.log("4 * 5 =", multiply(4, 5));
`,
          },
        ],
      },
    ],
  };
  return { root, activeFileId: mainId };
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    const { root, activeFileId } = makeDefaultFS();
    rooms.set(roomId, { users: new Map(), chat: [], fs: root, activeFileId, createdAt: Date.now() });
  }
  return rooms.get(roomId);
}

// ─── FileSystem helpers ────────────────────────────────────────────────────────

function findNode(root, id) {
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function removeNode(root, targetId) {
  if (!root.children) return;
  root.children = root.children.filter(c => c.id !== targetId);
  root.children.forEach(c => removeNode(c, targetId));
}

function buildFlatIndex(root, index = new Map()) {
  index.set(root.id, root);
  (root.children || []).forEach(c => buildFlatIndex(c, index));
  return index;
}

function detectLanguage(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".py": "python", ".html": "html", ".htm": "html",
    ".css": "css", ".json": "json",
    ".md": "markdown", ".mdx": "markdown",
    ".java": "java", ".cpp": "cpp", ".cc": "cpp",
    ".c": "c", ".go": "go", ".rs": "rust",
    ".rb": "ruby", ".sh": "shell", ".sql": "sql",
    ".xml": "xml", ".yaml": "yaml", ".yml": "yaml",
    ".txt": "plaintext",
  };
  return map[ext] || "plaintext";
}

// ─── Code Execution ────────────────────────────────────────────────────────────

/**
 * runCode — thin adapter between socket event and execution/runner.js
 * Normalises the runner's output shape to what the client expects:
 *   { fileId, success, output, errors, elapsed }
 */
async function runCode(language, code) {
  if (language === "html") {
    return { success: true, output: "__HTML_PREVIEW__", errors: "", elapsed: 0 };
  }
  const result = await executeCode(code, language);
  return {
    success: result.exitCode === 0 && !result.timedOut,
    output:  result.output  || "",
    errors:  result.error   || "",
    elapsed: result.executionTime || 0,
  };
}

// ─── User helpers ──────────────────────────────────────────────────────────────

function randomColor() {
  const colors = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7",
                  "#DDA0DD","#98D8C8","#F7DC6F","#BB8FCE","#85C1E9","#F0B27A","#82E0AA"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function broadcastUserList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const userList = Array.from(room.users.values()).map(({ id, username, color, cursor }) => ({ id, username, color, cursor }));
  io.to(roomId).emit("users-update", { users: userList, count: userList.length });
}

// ─── Express Routes ────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health",    (req, res) => res.json({ status: "ok", rooms: rooms.size }));
app.get("/new-room",  (req, res) => res.json({ roomId: uuidv4().slice(0, 8).toUpperCase() }));
app.get("/room/:id",  (req, res) => {
  const room = rooms.get(req.params.id.toUpperCase());
  res.json(room ? { exists: true, userCount: room.users.size } : { exists: false });
});

/**
 * POST /room/:roomId/upload
 * Accepts multiple files; fieldname = relative path for folder structure.
 * e.g.  fieldname="src/utils/helper.js"  → creates src/ folder with helper.js inside.
 */
app.post("/room/:roomId/upload", upload.any(), (req, res) => {
  // multer.any() accepts any field name — we use the field name as the relative file path
  // e.g. field name "src%2Futils.js" → "src/utils.js" in the tree
  const roomId = req.params.roomId.toUpperCase();
  const room   = getOrCreateRoom(roomId);
  if (!req.files?.length) return res.status(400).json({ error: "No files received" });

  let count = 0;
  for (const file of req.files) {
    const relPath = decodeURIComponent(file.fieldname).replace(/\\/g, "/");
    const parts   = relPath.split("/").filter(Boolean);

    // Walk/create the directory tree down to the file's parent folder
    let current = room.fs;
    for (let i = 0; i < parts.length - 1; i++) {
      let folder = current.children.find(c => c.type === "folder" && c.name === parts[i]);
      if (!folder) {
        folder = { id: uuidv4(), name: parts[i], type: "folder", parentId: current.id, children: [] };
        current.children.push(folder);
      }
      current = folder;
    }

    const filename = parts[parts.length - 1];
    let content = "";
    try { content = file.buffer.toString("utf8"); } catch { content = "[binary]"; }

    const existing = current.children.find(c => c.type === "file" && c.name === filename);
    if (existing) {
      existing.content = content;
    } else {
      current.children.push({
        id: uuidv4(), name: filename, type: "file",
        language: detectLanguage(filename), parentId: current.id,
        children: [], content,
      });
    }
    count++;
  }

  io.to(roomId).emit("fs-update", { fs: room.fs });
  res.json({ ok: true, files: count });
});

// ─── Socket.IO Event Handlers ──────────────────────────────────────────────────

io.on("connection", (socket) => {
  console.log(`[+] ${socket.id} connected`);
  let currentRoomId = null;

  socket.on("join-room", ({ roomId, username }) => {
    if (!roomId || !username) return;
    if (currentRoomId && currentRoomId !== roomId) leaveCurrentRoom();

    currentRoomId = roomId.toUpperCase();
    const room = getOrCreateRoom(currentRoomId);
    const user = { id: socket.id, username: username.trim().slice(0, 20) || "Anonymous", color: randomColor(), cursor: null, joinedAt: Date.now() };

    room.users.set(socket.id, user);
    socket.join(currentRoomId);
    console.log(`[Room ${currentRoomId}] ${user.username} joined (${room.users.size})`);

    socket.emit("room-joined", { roomId: currentRoomId, fs: room.fs, activeFileId: room.activeFileId, user, chatHistory: room.chat.slice(-50) });
    broadcastUserList(currentRoomId);

    const msg = { id: uuidv4(), type: "system", text: `${user.username} joined the room`, timestamp: Date.now() };
    room.chat.push(msg);
    io.to(currentRoomId).emit("chat-message", msg);
  });

  // Code change in a specific file
  socket.on("code-change", ({ roomId, fileId, code }) => {
    const rid = roomId?.toUpperCase();
    const room = rooms.get(rid);
    if (!room) return;
    const node = findNode(room.fs, fileId);
    if (!node || node.type !== "file") return;
    node.content = code;
    socket.to(rid).emit("code-update", { fileId, code, senderId: socket.id });
  });

  // Active file changed (tab switch)
  socket.on("active-file", ({ roomId, fileId }) => {
    const rid = roomId?.toUpperCase();
    const room = rooms.get(rid);
    if (!room) return;
    room.activeFileId = fileId;
    socket.to(rid).emit("active-file-update", { fileId, senderId: socket.id });
  });

  // Create file or folder
  socket.on("fs-create", ({ roomId, parentId, name, type }) => {
    const rid = roomId?.toUpperCase();
    const room = rooms.get(rid);
    if (!room || !name?.trim()) return;

    const parent = (parentId ? findNode(room.fs, parentId) : null) || room.fs;
    if (parent.type !== "folder") return;
    if (parent.children.find(c => c.name === name && c.type === type)) return;

    const node = {
      id: uuidv4(), name: name.trim(), type, parentId: parent.id, children: [],
      ...(type === "file" ? { language: detectLanguage(name), content: "" } : {}),
    };
    parent.children.push(node);
    io.to(rid).emit("fs-update", { fs: room.fs });

    if (type === "file") {
      room.activeFileId = node.id;
      io.to(rid).emit("active-file-update", { fileId: node.id, senderId: socket.id });
    }
  });

  // Rename file or folder
  socket.on("fs-rename", ({ roomId, nodeId, newName }) => {
    const rid = roomId?.toUpperCase();
    const room = rooms.get(rid);
    if (!room || !newName?.trim()) return;
    const node = findNode(room.fs, nodeId);
    if (!node || node.id === room.fs.id) return; // can't rename root
    node.name = newName.trim();
    if (node.type === "file") node.language = detectLanguage(newName);
    io.to(rid).emit("fs-update", { fs: room.fs });
  });

  // Delete file or folder
  socket.on("fs-delete", ({ roomId, nodeId }) => {
    const rid = roomId?.toUpperCase();
    const room = rooms.get(rid);
    if (!room || nodeId === room.fs.id) return; // can't delete root
    removeNode(room.fs, nodeId);

    if (room.activeFileId === nodeId) {
      const idx = buildFlatIndex(room.fs);
      const files = Array.from(idx.values()).filter(n => n.type === "file");
      room.activeFileId = files[0]?.id || null;
      io.to(rid).emit("active-file-update", { fileId: room.activeFileId, senderId: socket.id });
    }
    io.to(rid).emit("fs-update", { fs: room.fs });
  });

  // Move (drag & drop reparent)
  socket.on("fs-move", ({ roomId, nodeId, newParentId }) => {
    const rid = roomId?.toUpperCase();
    const room = rooms.get(rid);
    if (!room) return;
    const node = findNode(room.fs, nodeId);
    const newParent = findNode(room.fs, newParentId);
    if (!node || !newParent || newParent.type !== "folder" || node.id === newParentId) return;
    removeNode(room.fs, nodeId);
    node.parentId = newParentId;
    newParent.children.push(node);
    io.to(rid).emit("fs-update", { fs: room.fs });
  });

  // Execute code (server-side fallback; client also runs JS/TS/Python/HTML in-browser)
  socket.on("run-code", async ({ roomId, fileId, code, language }) => {
    const rid = roomId?.toUpperCase();
    console.log(`[Room ${rid}] Running ${language}`);
    const result = await runCode(language, code);
    socket.emit("run-result", { fileId, ...result });
  });

  // Cursor sharing
  socket.on("cursor-move", ({ roomId, cursor, fileId }) => {
    const rid = roomId?.toUpperCase();
    const room = rooms.get(rid);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (!user) return;
    user.cursor = cursor;
    socket.to(rid).emit("cursor-update", { userId: socket.id, username: user.username, color: user.color, cursor, fileId });
  });

  // Chat
  socket.on("chat-message", ({ roomId, text }) => {
    const rid = roomId?.toUpperCase();
    const room = rooms.get(rid);
    if (!room || !text?.trim()) return;
    const user = room.users.get(socket.id);
    if (!user) return;
    const message = { id: uuidv4(), type: "user", userId: socket.id, username: user.username, color: user.color, text: text.trim().slice(0, 500), timestamp: Date.now() };
    room.chat.push(message);
    if (room.chat.length > 50) room.chat.shift();
    io.to(rid).emit("chat-message", message);
  });

  socket.on("disconnect", () => {
    console.log(`[-] ${socket.id} disconnected`);
    leaveCurrentRoom();
  });

  function leaveCurrentRoom() {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const user = room.users.get(socket.id);
    room.users.delete(socket.id);
    if (user) {
      const msg = { id: uuidv4(), type: "system", text: `${user.username} left the room`, timestamp: Date.now() };
      room.chat.push(msg);
      io.to(currentRoomId).emit("chat-message", msg);
    }
    broadcastUserList(currentRoomId);
    if (room.users.size === 0) {
      setTimeout(() => { const r = rooms.get(currentRoomId); if (r?.users.size === 0) rooms.delete(currentRoomId); }, 30 * 60 * 1000);
    }
    currentRoomId = null;
  }
});

const PORT = process.env.PORT || 3001;
// To this:
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 CollabCode → http://localhost:${PORT}\n`);
});
