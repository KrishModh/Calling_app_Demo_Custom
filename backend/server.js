require('dotenv').config();
const http            = require('http');
const { Server }      = require('socket.io');
const app             = require('./app');
const { initSignaling } = require('./socket/signaling');

const PORT       = process.env.PORT       || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const server = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

initSignaling(io);

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀  Server listening on http://localhost:${PORT}`);
  console.log(`🌐  Accepting connections from ${CLIENT_URL}\n`);
});
