/**
 * signaling.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All Socket.IO signaling for WebRTC voice calls between two users.
 *
 * Fix: activeCalls Set prevents call-accepted being relayed twice,
 * which was causing the double offer/answer seen in production logs.
 */

/** @type {Map<string, string>}  userId → socketId */
const onlineUsers = new Map();

/**
 * Track active call pairs to prevent duplicate accepted signals.
 * Key: `${callerId}-${calleeId}`
 * @type {Set<string>}
 */
const activeCalls = new Set();

const initSignaling = (io) => {
  io.on('connection', (socket) => {
    console.log(`[socket] connected   ${socket.id}`);

    // ── 1. Register ────────────────────────────────────────────────────────
    socket.on('register', (userId) => {
      socket.userId = userId;
      onlineUsers.set(userId, socket.id);
      console.log(`[socket] registered  userId=${userId}  socket=${socket.id}`);
      broadcastOnlineUsers(io);
    });

    // ── 2. Call request (caller → callee) ──────────────────────────────────
    socket.on('call-request', ({ callerId, callerName, calleeId }) => {
      const calleeSocket = onlineUsers.get(calleeId);
      if (!calleeSocket) {
        socket.emit('call-failed', { message: 'The other user is offline.' });
        return;
      }
      io.to(calleeSocket).emit('incoming-call', { callerId, callerName });
      console.log(`[call]   request  ${callerId} → ${calleeId}`);
    });

    // ── 3a. Call accepted (callee → caller) ────────────────────────────────
    socket.on('call-accepted', ({ callerId, calleeId }) => {
      const callKey = `${callerId}-${calleeId}`;

      // Dedup: if this pair is already accepted, ignore
      if (activeCalls.has(callKey)) {
        console.log(`[call]   accepted DUPLICATE ignored ${calleeId} → ${callerId}`);
        return;
      }
      activeCalls.add(callKey);

      const callerSocket = onlineUsers.get(callerId);
      if (callerSocket) {
        io.to(callerSocket).emit('call-accepted', { calleeId });
        console.log(`[call]   accepted ${calleeId} → ${callerId}`);
      }
    });

    // ── 3b. Call rejected (callee → caller) ────────────────────────────────
    socket.on('call-rejected', ({ callerId, calleeId }) => {
      // Clean up active call tracking
      activeCalls.delete(`${callerId}-${calleeId}`);

      const callerSocket = onlineUsers.get(callerId);
      if (callerSocket) {
        io.to(callerSocket).emit('call-rejected', { calleeId });
        console.log(`[call]   rejected ${calleeId} → ${callerId}`);
      }
    });

    // ── 4. WebRTC Offer (caller → callee) ──────────────────────────────────
    socket.on('webrtc-offer', ({ offer, targetId, callerId }) => {
      const targetSocket = onlineUsers.get(targetId);
      if (targetSocket) {
        io.to(targetSocket).emit('webrtc-offer', { offer, callerId });
        console.log(`[webrtc] offer    ${callerId} → ${targetId}`);
      }
    });

    // ── 5. WebRTC Answer (callee → caller) ─────────────────────────────────
    socket.on('webrtc-answer', ({ answer, targetId, calleeId }) => {
      const targetSocket = onlineUsers.get(targetId);
      if (targetSocket) {
        io.to(targetSocket).emit('webrtc-answer', { answer, calleeId });
        console.log(`[webrtc] answer   ${calleeId} → ${targetId}`);
      }
    });

    // ── 6. ICE Candidates (bidirectional) ──────────────────────────────────
    socket.on('ice-candidate', ({ candidate, targetId, senderId }) => {
      const targetSocket = onlineUsers.get(targetId);
      if (targetSocket) {
        io.to(targetSocket).emit('ice-candidate', { candidate, senderId });
      }
    });

    // ── 7. Call ended ───────────────────────────────────────────────────────
    socket.on('call-ended', ({ targetId }) => {
      // Clean up active call tracking for both directions
      if (socket.userId) {
        activeCalls.delete(`${socket.userId}-${targetId}`);
        activeCalls.delete(`${targetId}-${socket.userId}`);
      }

      const targetSocket = onlineUsers.get(targetId);
      if (targetSocket) {
        io.to(targetSocket).emit('call-ended');
        console.log(`[call]   ended   ${socket.userId} → ${targetId}`);
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket.userId) {
        // Clean up any active calls involving this user
        for (const key of activeCalls) {
          if (key.includes(socket.userId)) activeCalls.delete(key);
        }
        onlineUsers.delete(socket.userId);
        console.log(`[socket] disconnected userId=${socket.userId}`);
        broadcastOnlineUsers(io);
      }
    });
  });
};

function broadcastOnlineUsers(io) {
  io.emit('online-users', Array.from(onlineUsers.keys()));
}

module.exports = { initSignaling };
