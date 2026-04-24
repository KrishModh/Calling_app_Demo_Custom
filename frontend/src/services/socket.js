/**
 * socket.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a singleton Socket.IO client instance shared across the app.
 *
 * Usage:
 *   import { connectSocket, getSocket, disconnectSocket } from './socket';
 *
 *   connectSocket(userId);   // call once after login
 *   getSocket();             // get the existing socket anywhere
 *   disconnectSocket();      // call on logout
 */

import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

/** @type {import('socket.io-client').Socket | null} */
let socket = null;

/**
 * Create (if needed) and connect the socket, then register the userId.
 * Safe to call multiple times – will skip reconnection if already open.
 *
 * @param {string} userId
 * @returns {import('socket.io-client').Socket}
 */
export const connectSocket = (userId) => {
  if (!socket) {
    socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }

  if (!socket.connected) {
    socket.connect();
    // Register once the TCP handshake completes
    socket.once('connect', () => {
      socket.emit('register', userId);
    });
  } else {
    // Already connected (e.g., page hot-reload), just re-register
    socket.emit('register', userId);
  }

  return socket;
};

/**
 * Return the existing socket instance (may be null before login).
 * @returns {import('socket.io-client').Socket | null}
 */
export const getSocket = () => socket;

/**
 * Disconnect and destroy the singleton – call on logout.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
