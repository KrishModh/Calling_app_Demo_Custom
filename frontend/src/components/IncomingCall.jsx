import React from 'react';
import '../styles/call.css';

/**
 * IncomingCall
 * Full-screen overlay that appears when a remote user is calling.
 */
export default function IncomingCall({ callerName, onAccept, onReject }) {
  const initial = (callerName || '?')[0].toUpperCase();

  return (
    <div className="incoming-overlay">
      <div className="incoming-card">
        {/* Pulsing ring + avatar */}
        <div className="incoming-ring">
          <div className="ring ring-1" />
          <div className="ring ring-2" />
          <div className="incoming-avatar">{initial}</div>
        </div>

        <p className="incoming-label">Incoming voice call</p>
        <h2 className="incoming-caller">{callerName || 'Unknown'}</h2>

        {/* Action buttons */}
        <div className="incoming-actions">
          <button className="action-btn reject-btn" onClick={onReject}>
            <span className="action-icon">📵</span>
            <span>Decline</span>
          </button>
          <button className="action-btn accept-btn" onClick={onAccept}>
            <span className="action-icon">📞</span>
            <span>Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
