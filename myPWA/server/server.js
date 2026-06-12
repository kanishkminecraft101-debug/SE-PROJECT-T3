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
  // Create seats table if it doesn't exist
  db.run(
    `CREATE TABLE IF NOT EXISTS seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      row INTEGER,
      col INTEGER,
      price REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (event_id) REFERENCES events(id)
    )`
  );

  // Create bookings table if it doesn't exist
  db.run(
    `CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      event_id INTEGER NOT NULL,
      seat_id INTEGER NOT NULL,
      booked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (seat_id) REFERENCES seats(id)
    )`
  );

  // Seed events if table is empty
  db.get('SELECT COUNT(*) as count FROM events', (err, row) => {
    if (err || !row || row.count > 0) return; // Skip if error or events exist
    const sampleEvents = [
      { title: 'Hamilton', location: 'Theater District', date: '2024-06-15', time: '19:00', description: 'An American Musical' },
      { title: 'Phantom of the Opera', location: 'Broadway', date: '2024-06-20', time: '19:30', description: 'The longest-running show' },
      { title: 'Les Miserables', location: 'Lincoln Center', date: '2024-06-25', time: '20:00', description: 'Historical epic musical' }
    ];
    const stmt = db.prepare('INSERT INTO events (title, location, date, time, description) VALUES (?, ?, ?, ?, ?)');
    sampleEvents.forEach(evt => {
      stmt.run(evt.title, evt.location, evt.date, evt.time, evt.description);
    });
    stmt.finalize(() => {
      console.log('Sample events seeded.');
    });
  });
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

// Seats API: list seats for an event
router.get('/seats', (req, res) => {
  const eventId = req.query.event_id || null;
  if (!eventId) return res.status(400).json({ message: 'event_id query parameter is required' });

  db.all(
    'SELECT id, event_id, label, row, col, price, status FROM seats WHERE event_id = ? ORDER BY row, col', 
    [eventId],
    (err, rows) => { 
      if (err) return sendServerError(res, err);
      if (rows && rows.length > 0) return res.json({ seats: rows });

      // Auto-seed a basic seating layout if none exist for the event
      const seatRows = ['A','B','C','D'];
      const seatsPerRow = 15;
      const insertStmt = db.prepare('INSERT INTO seats (event_id, label, row, col, price, status) VALUES (?, ?, ?, ?, ?, ?)');
      for (const r of seatRows) {
        for (let c = 1; c <= seatsPerRow; c++) {
          const label = `${r}${c}`;
          insertStmt.run(eventId, label, r.charCodeAt(0), c, 0.0, 'available');
        }
      }
      insertStmt.finalize((insertErr) => {
        if (insertErr) return sendServerError(res, insertErr);
        db.all('SELECT id, event_id, label, row, col, price, status FROM seats WHERE event_id = ? ORDER BY row, col', [eventId], (err2, newRows) => {
          if (err2) return sendServerError(res, err2);
          return res.json({ seats: newRows || [] });
        });
      });
    }
  );
});

// Book seats atomically: expects { seats: [seatId,...], event_id }
router.post('/book', requireAuth, (req, res) => {
  const { seats, event_id } = req.body || {};
  const userId = req.user?.id || null;
  if (!Array.isArray(seats) || seats.length === 0 || !event_id) return res.status(400).json({ message: 'event_id and seats array are required' });

  const placeholders = seats.map(() => '?').join(','); // Create placeholders for the number of seats to be booked in the SQL query
  const sqlUpdate = `UPDATE seats SET status = 'booked' WHERE id IN (${placeholders}) AND event_id = ? AND status = 'available'`;
  const params = [...seats, event_id];

  db.run('BEGIN TRANSACTION'); // Start a transaction to ensure atomicity of the booking operation
  db.run(sqlUpdate, params, function (updateErr) {
    if (updateErr) {
      db.run('ROLLBACK');
      return sendServerError(res, updateErr);
    }

    const changed = this.changes || 0; 
    if (changed !== seats.length) {
      db.run('ROLLBACK');
      return res.status(409).json({ message: 'One or more seats are already booked' }); // If the number of rows updated does not match the number of seats requested, it means some seats were already booked, so we roll back the transaction and return a 409 Conflict response.
    }

    const insertStmt = db.prepare('INSERT INTO bookings (user_id, event_id, seat_id) VALUES (?, ?, ?)');
    for (const seatId of seats) insertStmt.run(userId, event_id, seatId);
    insertStmt.finalize((finalizeErr) => {
      if (finalizeErr) {
        db.run('ROLLBACK');
        return sendServerError(res, finalizeErr);
      }
      db.run('COMMIT');
      return res.json({ message: 'Seats booked successfully', seats });
    });
  });
});
