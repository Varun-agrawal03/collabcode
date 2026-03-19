# ⌨ CollabCode 

> Real-time collaborative code editor with a VS Code–style file explorer,
> multi-tab editing, and in-browser execution for JavaScript, TypeScript,
> Python, and HTML.

---

## ✨ Features

| | Feature | Detail |
|---|---|---|
| ▶ | **Run code** | JS & TS in a Web Worker sandbox · Python via Pyodide WASM · HTML live iframe preview |
| 📁 | **File explorer** | Full project tree — create, rename, delete files & folders |
| 🗂 | **Multi-tab editing** | Open multiple files simultaneously, VS Code–style tab bar |
| 📤 | **Upload files** | Single files or entire folder trees (structure preserved) |
| 📦 | **ZIP download** | Export the whole project as a `.zip` in one click |
| 👥 | **Live presence** | Colored user avatars, cursor positions, join/leave toasts |
| 💬 | **Room chat** | Per-room chat with system messages and user history |
| 🔄 | **Real-time sync** | Every keystroke, file op, and language switch syncs instantly |
| ⌨ | **Monaco editor** | VS Code's editor engine — IntelliSense, bracket pairs, ligatures |

---

## 🚀 Quick start

```bash
# 1 — Unzip
unzip collab-editor-v2.zip && cd collab-editor

# 2 — Install all dependencies (~60 seconds)
npm run install:all

# 3 — Start both server and client
npm run dev
```

| Service | URL |
|---|---|
| React client | http://localhost:3000 |
| API / WebSocket | http://localhost:3001 |

Open the client in **two browser tabs**, create a room in one, share the URL with the other, and start editing together.

---

## 📁 Project structure

```
collab-editor/
├── package.json                    ← root scripts (install:all, dev)
│
├── server/
│   ├── index.js                    ← Express + Socket.IO server
│   │                                 room filesystem, CRUD events,
│   │                                 file upload endpoint
│   └── execution/
│       └── runner.js               ← code execution engine
│                                     JS · TS · Python · C++ · Java
│
└── client/src/
    ├── App.js                      ← hash-based routing
    ├── styles.css                  ← all styles (dark terminal-luxe theme)
    │
    ├── hooks/
    │   ├── useSocket.js            ← stable Socket.IO connection
    │   ├── useRoom.js              ← room state, fs sync, anti-loop logic
    │   └── useCodeRunner.js        ← client-side execution
    │                                 JS/TS → Web Worker
    │                                 Python → Pyodide (WASM, CDN)
    │                                 HTML  → <iframe srcDoc>
    │
    └── components/
        ├── LandingPage.js          ← create / join room
        ├── EditorPage.js           ← main layout
        ├── Toolbar.js              ← ▶ Run, Share, view toggles
        ├── UserPresence.js         ← colored user list
        ├── ChatPanel.js            ← room chat
        ├── filesystem/
        │   └── FileExplorer.js     ← tree, context menu, upload, ZIP
        ├── tabs/
        │   └── FileTabs.js         ← multi-tab bar
        └── runner/
            └── OutputPanel.js      ← console + HTML preview
```

---

## ▶ Running code

### Keyboard shortcut
**`Ctrl+Enter`** (or `Cmd+Enter` on Mac) runs the currently open file.

### Supported languages

| Language | Runtime | Notes |
|---|---|---|
| JavaScript | Web Worker (V8) | Instant. Sandboxed — no DOM, no `require`. |
| TypeScript | Web Worker | Types stripped client-side, runs as JS. |
| Python | [Pyodide](https://pyodide.org) WASM | First run loads ~10 MB from CDN — cached after. |
| HTML | `<iframe srcDoc>` | Live preview in the **Preview** tab. |
| C++ | `g++` (server) | Requires g++ installed on the server machine. |
| Java | `javac` + `java` (server) | Requires JDK installed on the server machine. |

### Output panel
The panel below the editor shows:
- **Console tab** — stdout (white) and stderr (red), exit badge, elapsed ms
- **Preview tab** (HTML only) — sandboxed iframe rendering your HTML

---

## 📁 File explorer

| Action | How |
|---|---|
| Open file | Click it |
| Expand / collapse folder | Click it |
| Create file | `📄+` button or right-click → New File |
| Create folder | `📁+` button or right-click → New Folder |
| Rename | Right-click → Rename, type, then Enter |
| Delete | Right-click → Delete |
| Upload files | `⬆` button → file picker (multiple files OK) |
| Upload folder | `📂⬆` button → folder picker (structure preserved) |
| Download ZIP | `⬇ZIP` button — bundles the whole project client-side |

---

## 🔄 WebSocket event reference

| Event | Direction | Payload |
|---|---|---|
| `join-room` | C→S | `{ roomId, username }` |
| `room-joined` | S→C | `{ fs, activeFileId, user, chatHistory }` |
| `code-change` | C→S | `{ roomId, fileId, code }` |
| `code-update` | S→C | `{ fileId, code, senderId }` *(excludes sender)* |
| `fs-create` | C→S | `{ roomId, parentId, name, type }` |
| `fs-rename` | C→S | `{ roomId, nodeId, newName }` |
| `fs-delete` | C→S | `{ roomId, nodeId }` |
| `fs-move` | C→S | `{ roomId, nodeId, newParentId }` |
| `fs-update` | S→C | `{ fs }` full tree, broadcast to all |
| `active-file` | C→S | `{ roomId, fileId }` |
| `active-file-update` | S→C | `{ fileId, senderId }` |
| `run-code` | C→S | `{ roomId, fileId, code, language }` |
| `run-result` | S→C | `{ fileId, success, output, errors, elapsed }` |
| `cursor-move` | C→S | `{ roomId, cursor, fileId }` |
| `cursor-update` | S→C | `{ userId, username, color, cursor, fileId }` |
| `chat-message` | Both | `{ id, type, userId, username, color, text, timestamp }` |
| `users-update` | S→C | `{ users[], count }` |

---

## 🔁 Anti-loop architecture

The fundamental challenge in collaborative editors: if A's edit is sent to B, and B's editor fires `onChange`, B would re-emit it — creating an infinite loop.

**Solution** (in `useRoom.js`):

```
User types
  ↓
handleCodeChange(fileId, newCode)
  ↓  remoteUpdateFile.current === fileId?
  │    YES → clear flag, return (skip emit)    ← breaks the loop
  │    NO  → emit("code-change") to server
  ↓
Server receives
  ↓  updates room.fs[fileId].content
  ↓  socket.to(room).emit("code-update")       ← excludes sender
  ↓
Other clients receive "code-update"
  ↓  set remoteUpdateFile.current = fileId
  ↓  update Monaco value
  ↓  Monaco fires onChange
  ↓  handleCodeChange sees flag → SKIPS emit   ← loop broken
```

---

## 🌐 Environment variables

```bash
# client/.env  (copy from client/.env.example)
REACT_APP_SERVER_URL=http://localhost:3001
```

---

## 🛠 Scripts

```bash
npm run install:all   # install root + server + client deps
npm run dev           # start both concurrently
npm run dev:server    # server only (nodemon, auto-reload)
npm run dev:client    # client only (CRA dev server)
```

---

## 🏗 Scaling notes

| Concern | Solution |
|---|---|
| Multiple server instances | Add Redis adapter for Socket.IO |
| Room persistence | Replace `rooms` Map with MongoDB |
| Python execution | Runs in-browser via Pyodide — no server Python needed |
| File size limit | 5 MB/file (set in `server/index.js` multer config) |
| Room cleanup | Empty rooms deleted after 30 min |


## DEVELOPED BY VARUN (CSE student at NITRR).

