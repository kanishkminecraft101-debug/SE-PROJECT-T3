// Basic PWA server
const express = require('express');
const path = require('path');
const authRoutes = require('./server/server');

const app = express();
app.use(express.json());

// Serve static assets
app.use(authRoutes);

// Fallback to login page (serve login directly to avoid index.html flash)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve static assets but disable default index serving
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Express error:', err);
  res.status(500).json({ message: err?.message || 'Internal server error' });
});

const PORT = 8000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Basic PWA server running at http://0.0.0.0:${PORT}`);
});
