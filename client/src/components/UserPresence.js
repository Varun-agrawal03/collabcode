/**
 * UserPresence.js
 * 
 * Displays list of users currently in the room with their color badges.
 */

import React from "react";

function UserPresence({ users, currentUser }) {
  return (
    <div className="user-presence">
      <div className="presence-header">
        <h3>Active Collaborators</h3>
        <span className="user-count-tag">{users.length} online</span>
      </div>

      <div className="user-list">
        {users.map((user) => (
          <div className="user-item" key={user.id}>
            <div className="user-avatar" style={{ background: user.color }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">
                {user.username}
                {currentUser && user.id === currentUser.id && (
                  <span className="you-badge"> (you)</span>
                )}
              </span>
              {user.cursor && (
                <span className="user-cursor-pos">
                  Ln {user.cursor.line}, Col {user.cursor.column}
                </span>
              )}
            </div>
            <div className="user-status-dot" style={{ background: user.color }} />
          </div>
        ))}
      </div>

      <div className="presence-tip">
        <p>Share the room ID or URL to invite collaborators</p>
      </div>
    </div>
  );
}

export default UserPresence;
