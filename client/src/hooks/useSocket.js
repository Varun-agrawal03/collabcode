/**
 * useSocket.js
 * 
 * Custom hook that manages the Socket.IO connection lifecycle.
 * Returns a stable socket instance that persists across renders.
 * 
 * Usage: const socket = useSocket("http://localhost:3001");
 */

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SERVER_URL = process.env.REACT_APP_SERVER_URL || "http://localhost:3001";

export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    // Create socket connection once on mount
    socketRef.current = io(SERVER_URL, {
      transports: ["websocket", "polling"], // Try WebSocket first, fall back to polling
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const socket = socketRef.current;

    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err.message);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
    };
  }, []);

  return socketRef;
}
