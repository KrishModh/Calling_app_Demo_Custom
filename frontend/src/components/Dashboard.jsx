import React from 'react';
import '../styles/dashboard.css';

/**
 * Dashboard
 * Shows the logged-in user's status and a contact card for the other user.
 */
export default function Dashboard({
  currentUser,
  otherUser,
  onlineUsers,
  onCallUser,
  onLogout,
}) {
  const isOtherOnline = otherUser && onlineUsers.includes(otherUser.id);

  const initials = (name = '') =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="dashboard-page">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-brand">
          <span className="dash-brand-icon">📞</span>
          <span className="dash-brand-name">VoiceCall</span>
        </div>
        <div className="dash-user-info">
          <div className="dash-avatar">{initials(currentUser.name)}</div>
          <span className="dash-username">{currentUser.name}</span>
          <button className="dash-logout" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="dash-main">
        {/* Status pill */}
        <div className="status-pill">
          <span className="status-dot online" />
          You are online
        </div>

        <h2 className="contacts-heading">Contacts</h2>

        <div className="contacts-list">
          {otherUser ? (
            <div className="contact-card">
              <div className="contact-avatar-wrap">
                <div className="contact-avatar">{initials(otherUser.name)}</div>
                <span className={`presence-dot ${isOtherOnline ? 'online' : 'offline'}`} />
              </div>
              <div className="contact-meta">
                <span className="contact-name">{otherUser.name}</span>
                <span className={`contact-status ${isOtherOnline ? 'online' : 'offline'}`}>
                  {isOtherOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <button
                className={`call-btn ${!isOtherOnline ? 'disabled' : ''}`}
                disabled={!isOtherOnline}
                onClick={() => isOtherOnline && onCallUser(otherUser)}
                title={isOtherOnline ? `Call ${otherUser.name}` : 'User is offline'}
              >
                <span className="call-icon">📞</span>
                Call
              </button>
            </div>
          ) : (
            <p className="no-contacts">No other contacts found.</p>
          )}
        </div>
      </main>
    </div>
  );
}
