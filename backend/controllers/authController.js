require('dotenv').config();

// ── In-memory user registry (credentials come from ENV only) ──────────────────
const getUsers = () => [
  {
    id: '1',
    name: 'User One',
    email: process.env.USER1_EMAIL,
    password: process.env.USER1_PASSWORD,
  },
  {
    id: '2',
    name: 'User Two',
    email: process.env.USER2_EMAIL,
    password: process.env.USER2_PASSWORD,
  },
];

// POST /api/auth/login
const login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = getUsers().find(
    (u) => u.email === email && u.password === password,
  );

  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  // Never return the password to the client
  const { password: _pw, ...safeUser } = user;
  return res.status(200).json({ message: 'Login successful.', user: safeUser });
};

// POST /api/auth/logout  (stateless – just an acknowledgement)
const logout = (_req, res) => {
  return res.status(200).json({ message: 'Logged out successfully.' });
};

module.exports = { login, logout };
