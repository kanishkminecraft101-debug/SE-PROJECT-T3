const express = require('express');
const bcrypt = require('bcrypt'); // For password hashing
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const router = express.Router();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open SQLite database:', err);
  }
});

const saltRounds = 10; // Number of salt rounds for bcrypt hashing
const JWT_SECRET = process.env.JWT_SECRET || 'stagepass_jwt_secret';
const JWT_EXPIRES_IN = '2h';

db.serialize(() => { // Create users table if it doesn't exist
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`
  );

  db.run( // Create events table if it doesn't exist
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      location TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      description TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )`
  );
});

function logError(err) {
  const logMessage = `[${new Date().toISOString()}] ${err?.stack || err?.message || String(err)}\n`;
  try {
    fs.appendFileSync(path.join(__dirname, 'server-error.log'), logMessage);
  } catch (writeErr) {
    console.error('Failed to write error log:', writeErr);
  }
}

function sendServerError(res, err) { // Helper function to send a 500 Internal Server Error response
  console.error('Internal server error:', err);
  logError(err);
  return res.status(500).json({ message: err?.message || 'Internal server error' });
}

function generateToken(user) { // Generate JWT token for authenticated user
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function getTokenFromHeader(req) { // Extract JWT token from Authorization header
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
}

function requireAuth(req, res, next) { // Middleware to require authentication for protected routes
  const token = getTokenFromHeader(req);
  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => { // Verify the token and extract user information
    if (err) {
      return res.status(401).json({ message: 'Invalid or expired token.' });
    }
    req.user = decoded;
    next();
  });
}

function requireRole(...allowedRoles) { // Middleware to require specific user roles for access control
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    next();
  };
}

router.use(express.json());

router.post('/signup', (req, res) => { // Handle user signup
  console.log('Signup request body:', req.body);
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => { // Check if username already exists
    if (err) return sendServerError(res, err);
    if (row) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    bcrypt.hash(password, saltRounds, (hashErr, hashedPassword) => { // Hash the password before storing it in the database
      if (hashErr) return sendServerError(res, hashErr); // Hashing error

      db.run(
        'INSERT INTO users (username, password) VALUES (?, ?)', // Insert new user into database
        [username, hashedPassword],
        function (insertErr) { 
          if (insertErr) return sendServerError(res, insertErr);
          return res.status(201).json({ message: 'User registered successfully.' });
        }
      );
    });
  });
});

router.post('/login', (req, res) => { // Handle user login
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  db.get(
    'SELECT id, username, password, role FROM users WHERE username = ?', // Check if user exists and password matches
    [username],
    (err, user) => {
      if (err) return sendServerError(res, err);
      if (!user) {
        return res.status(401).json({ message: 'Invalid username or password.' });
      }

      bcrypt.compare(password, user.password, (compareErr, matched) => { // Compare provided password with hashed password in database
        if (compareErr) return sendServerError(res, compareErr);
        if (!matched) {
          return res.status(401).json({ message: 'Invalid username or password.' }); // Return 401 Unauthorized if password does not match
        }

        const token = generateToken(user);
        return res.json({ 
          message: 'Login successful.',
          token,
          user: { id: user.id, username: user.username, role: user.role }
        });
      });
    }
  );
});

router.get('/events', (req, res) => { // Get all events
  db.all('SELECT id, title, location, date, time, description FROM events ORDER BY date ASC', (err, rows) => {
    if (err) return sendServerError(res, err);
    return res.json({ events: rows || [] });
  });
});

router.get('/events/:id', (req, res) => { // Get a single event by ID
  const eventId = req.params.id;
  db.get(
    'SELECT id, title, location, date, time, description FROM events WHERE id = ?',
    [eventId],
    (err, row) => {
      if (err) return sendServerError(res, err);
      if (!row) {
        return res.status(404).json({ message: 'Event not found.' });
      }
      return res.json({ event: row });
    }
  );
});

router.get('/me', requireAuth, (req, res) => { // Get current authenticated user info
  return res.json({ user: req.user });
});

router.get('/admin/status', requireAuth, requireRole('admin'), (req, res) => { // Example admin-only route to check admin status
  return res.json({ message: 'Admin access granted.', user: req.user });
});

module.exports = router;
