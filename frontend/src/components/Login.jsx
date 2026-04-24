import React, { useState } from 'react';
import '../styles/login.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

export default function Login({ onLogin }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res  = await fetch(`${SERVER_URL}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Login failed. Please try again.');
      } else {
        onLogin(data.user);
      }
    } catch {
      setError('Cannot reach the server. Is it running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-logo">📞</div>
          <h1 className="login-title">VoiceCall</h1>
          <p className="login-subtitle">Sign in to start calling</p>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="login-error">{error}</p>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? (
              <span className="spinner" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="login-hint">Demo credentials are in your <code>.env</code> file.</p>
      </div>
    </div>
  );
}
