import React, { useState, useEffect } from 'react';
import '../styles/call.css';

/**
 * CallScreen
 * Shown for both 'calling' (outgoing, waiting) and 'in-call' states.
 */
export default function CallScreen({
  callState,
  peerName,
  isMuted,
  onToggleMute,
  onEndCall,
}) {
  const [elapsed, setElapsed] = useState(0);

  // Start/stop the timer only while the call is live
  useEffect(() => {
    if (callState !== 'in-call') {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [callState]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const initial = (peerName || '?')[0].toUpperCase();

  return (
    <div className="call-screen">
      <div className="call-card">
        {/* Avatar */}
        <div className={`call-avatar-ring ${callState === 'in-call' ? 'active' : ''}`}>
          <div className="call-avatar">{initial}</div>
        </div>

        {/* Name + status */}
        <h2 className="call-peer-name">{peerName || 'Unknown'}</h2>
        <p className="call-status-label">
          {callState === 'calling'
            ? 'Calling…'
            : `Connected · ${formatTime(elapsed)}`}
        </p>

        {/* Sound-wave animation (only when in-call) */}
        {callState === 'in-call' && (
          <div className="sound-wave">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="wave-bar"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="call-controls">
          {callState === 'in-call' && (
            <button
              className={`ctrl-btn mute-btn ${isMuted ? 'muted' : ''}`}
              onClick={onToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <span className="ctrl-icon">{isMuted ? '🔇' : '🎤'}</span>
              <span className="ctrl-label">{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
          )}

          <button
            className="ctrl-btn end-btn"
            onClick={onEndCall}
            title="End call"
          >
            <span className="ctrl-icon">📵</span>
            <span className="ctrl-label">End</span>
          </button>
        </div>
      </div>
    </div>
  );
}
