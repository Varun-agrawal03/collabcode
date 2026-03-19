/**
 * ChatPanel.js
 * 
 * In-room chat with user messages and system events.
 * Auto-scrolls to latest message.
 */

import React, { useState, useEffect, useRef } from "react";

function ChatPanel({ messages, currentUser, onSend }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input);
    setInput("");
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet. Say hello! 👋</div>
        )}

        {messages.map((msg) => {
          if (msg.type === "system") {
            return (
              <div key={msg.id} className="chat-system">
                {msg.text}
              </div>
            );
          }

          const isOwn = currentUser && msg.userId === currentUser.id;

          return (
            <div key={msg.id} className={`chat-msg ${isOwn ? "own" : ""}`}>
              <div className="chat-msg-header">
                <span
                  className="chat-username"
                  style={{ color: msg.color }}
                >
                  {msg.username}
                </span>
                <span className="chat-time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="chat-bubble" style={isOwn ? { borderColor: msg.color } : {}}>
                {msg.text}
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSend}>
        <input
          className="chat-input"
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
        />
        <button className="chat-send-btn" type="submit">
          ↑
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
