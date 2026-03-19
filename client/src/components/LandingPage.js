/**
 * LandingPage.js — v2
 * Entry screen: create new room or join by ID.
 */

import React, { useState } from "react";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

export default function LandingPage({ initialRoomId, onJoin }) {
  const [username,   setUsername]   = useState("");
  const [roomInput,  setRoomInput]  = useState(initialRoomId || "");
  const [isCreating, setIsCreating] = useState(false);
  const [error,      setError]      = useState("");

  const validate = () => {
    if (!username.trim()) { setError("Please enter your name."); return false; }
    if (!roomInput.trim()) { setError("Please enter a room ID."); return false; }
    setError(""); return true;
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (validate()) onJoin(roomInput, username);
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!username.trim()) { setError("Please enter your name first."); return; }
    setIsCreating(true);
    try {
      const res = await fetch(`${SERVER_URL}/new-room`);
      const { roomId } = await res.json();
      onJoin(roomId, username);
    } catch {
      setError("Could not reach server. Is it running on :3001?");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="landing">
      <div className="landing-bg">
        <div className="grid-lines" />
        {[...Array(6)].map((_, i) => <div key={i} className={`orb orb-${i + 1}`} />)}
      </div>

      <div className="landing-content">
        <div className="logo-area">
          <div className="logo-icon">⌨</div>
          <h1 className="logo-text">CollabCode</h1>
          <p className="logo-sub">Real-time collaborative code editor &amp; runner</p>
        </div>

        <div className="landing-card">
          <form onSubmit={handleJoin}>
            <div className="field-group">
              <label className="field-label">Your Name</label>
              <input
                className="field-input"
                type="text"
                placeholder="e.g. Raj"
                value={username}
                onChange={e => setUsername(e.target.value)}
                maxLength={20}
                autoFocus
              />
            </div>

            <div className="divider-text">JOIN A ROOM</div>

            <div className="field-group">
              <label className="field-label">Room ID</label>
              <input
                className="field-input room-input"
                type="text"
                placeholder="e.g. ABC123"
                value={roomInput}
                onChange={e => setRoomInput(e.target.value.toUpperCase())}
                maxLength={12}
              />
            </div>

            {error && <p className="error-msg">{error}</p>}

            <button className="btn btn-primary" type="submit">Join Room →</button>

            <div className="or-divider"><span>or</span></div>

            <button
              className="btn btn-secondary"
              type="button"
              onClick={handleCreateRoom}
              disabled={isCreating}
            >
              {isCreating ? "Creating…" : "✦ Create New Room"}
            </button>
          </form>
        </div>

        <div className="feature-pills">
          <span className="pill">▶ Run JS &amp; Python</span>
          <span className="pill">🌐 HTML Preview</span>
          <span className="pill">📁 File Explorer</span>
          <span className="pill">📤 Folder Upload</span>
          <span className="pill">📦 ZIP Download</span>
          <span className="pill">👥 Live Presence</span>
        </div>
      </div>
    </div>
  );
}
