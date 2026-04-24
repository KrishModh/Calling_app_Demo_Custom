require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const authRoutes = require('./routes/authRoutes');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = app;
