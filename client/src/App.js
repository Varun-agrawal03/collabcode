/**
 * App.js
 * 
 * Top-level router. Shows landing page or editor based on room state.
 * No external router needed — uses URL hash for simplicity.
 */

import React, { useState, useEffect } from "react";
import LandingPage from "./components/LandingPage";
import EditorPage from "./components/EditorPage";
import "./styles.css";

function App() {
  const [roomId, setRoomId] = useState(null);
  const [username, setUsername] = useState("");

  // Check URL hash for room ID on load (e.g., /#ROOM123)
  useEffect(() => {
    const hash = window.location.hash.replace("#", "").toUpperCase();
    if (hash && hash.length >= 4) {
      setRoomId(hash);
    }
  }, []);

  const handleJoinRoom = (rid, uname) => {
    const cleanId = rid.toUpperCase().trim();
    setRoomId(cleanId);
    setUsername(uname.trim());
    window.location.hash = cleanId; // Update URL for sharing
  };

  const handleLeaveRoom = () => {
    setRoomId(null);
    setUsername("");
    window.location.hash = "";
  };

  if (roomId && username) {
    return (
      <EditorPage
        roomId={roomId}
        username={username}
        onLeave={handleLeaveRoom}
      />
    );
  }

  return (
    <LandingPage
      initialRoomId={roomId}
      onJoin={handleJoinRoom}
    />
  );
}

export default App;
