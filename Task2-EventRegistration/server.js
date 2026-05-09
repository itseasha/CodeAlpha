'use strict';

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3002;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3002').split(',');

// ─── Session Configuration (CRITICAL for user persistence) ────────────────────

app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    table: 'sessions',
    concurrentDB: true
  }),
  secret: process.env.SESSION_SECRET || 'eventhub-pk-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax'
  },
  name: 'eventhub.sid'
}));

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS policy: origin '${origin}' not allowed`));
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
  credentials: true // Important for sessions
}));

app.use(express.json({ limit: '16kb' }));
app.use(express.static('public'));

// ─── Simple rate limiter (in-memory, per IP) ─────────────────────────────────

const rateLimitMap = new Map();

function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = rateLimitMap.get(key) || { count: 0, start: now };

    if (now - entry.start > windowMs) {
      entry.count = 1;
      entry.start = now;
    } else {
      entry.count += 1;
    }

    rateLimitMap.set(key, entry);

    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  };
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [key, entry] of rateLimitMap) {
    if (entry.start < cutoff) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

// ─── Authentication Middleware ────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Please log in first' });
  }
  next();
}

function getCurrentUser(req) {
  if (req.session.userId && req.session.userEmail) {
    return { id: req.session.userId, email: req.session.userEmail, name: req.session.userName };
  }
  return null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 60;
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/.test(email) && email.length <= 100;
}

function isValidPhone(phone) {
  if (typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15;
}

function isValidCity(city) {
  const allowed = ['Karachi','Lahore','Islamabad','Rawalpindi','Faisalabad','Multan','Gujranwala','Hyderabad','Peshawar','Quetta'];
  return typeof city === 'string' && allowed.includes(city);
}

function isValidTicketCount(n) {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

// ─── Database ─────────────────────────────────────────────────────────────────

let db;

async function initDB() {
  db = await open({
    filename: process.env.DB_PATH || './events.db',
    driver: sqlite3.Database,
  });

  // Enable WAL mode for better concurrent read performance
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA foreign_keys = ON;');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      title          TEXT    NOT NULL,
      description    TEXT    NOT NULL,
      date           TEXT    NOT NULL,
      location       TEXT    NOT NULL,
      city           TEXT    NOT NULL,
      capacity       INTEGER NOT NULL CHECK (capacity > 0),
      registered_count INTEGER NOT NULL DEFAULT 0 CHECK (registered_count >= 0),
      price          INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
      category       TEXT    NOT NULL DEFAULT 'Conference',
      status         TEXT    NOT NULL DEFAULT 'upcoming',
      organizer      TEXT,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      email      TEXT    UNIQUE NOT NULL,
      phone      TEXT    NOT NULL,
      city       TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id),
      event_id          INTEGER NOT NULL REFERENCES events(id),
      tickets_count     INTEGER NOT NULL DEFAULT 1 CHECK (tickets_count BETWEEN 1 AND 5),
      total_amount      INTEGER NOT NULL DEFAULT 0,
      status            TEXT    NOT NULL DEFAULT 'confirmed',
      registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, event_id)
    );

    CREATE INDEX IF NOT EXISTS idx_events_date     ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_city     ON events(city);
    CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
    CREATE INDEX IF NOT EXISTS idx_registrations_user  ON registrations(user_id);
    CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
  `);

  const { count } = await db.get('SELECT COUNT(*) as count FROM events');
  if (count === 0) {
    await db.exec(`
      INSERT INTO events (title, description, date, location, city, capacity, price, category, organizer) VALUES
      ('Industrial Safety Workshop', 'Learn essential workplace safety protocols and emergency response procedures. Get certified in just 2 days!', '2025-06-15', 'Karachi Expo Center', 'Karachi', 100, 4999, 'Workshop', 'Safety Council Pakistan'),
      ('PLC Programming Bootcamp', 'Hands-on training on PLC programming for industrial automation. Includes practical sessions.', '2025-06-20', 'Lahore Tech Hub', 'Lahore', 50, 7999, 'Training', 'AutoTech Solutions'),
      ('Industry 4.0 Summit', 'Annual conference on smart manufacturing and digital transformation in Pakistan.', '2025-07-10', 'Islamabad Convention Center', 'Islamabad', 200, 14999, 'Conference', 'Digital Pakistan Initiative'),
      ('Lean Manufacturing Certification', 'Comprehensive course on lean principles and Six Sigma for manufacturing excellence.', '2025-07-25', 'Faisalabad Trade Centre', 'Faisalabad', 75, 12999, 'Certification', 'Lean Institute Pakistan'),
      ('HVAC Maintenance Training', 'Practical training on HVAC systems maintenance and troubleshooting for commercial buildings.', '2025-08-05', 'Rawalpindi Tech Park', 'Rawalpindi', 60, 5999, 'Training', 'Green Building Council'),
      ('Electrical Safety Certification', 'Complete electrical safety training for industrial workers and supervisors.', '2025-08-15', 'Multan Stadium Complex', 'Multan', 80, 3999, 'Certification', 'PEC'),
      ('Quality Control in Manufacturing', 'Learn modern QC techniques and statistical process control.', '2025-08-20', 'Gujranwala Industrial Estate', 'Gujranwala', 45, 6999, 'Training', 'Quality Experts Pakistan'),
      ('Renewable Energy Workshop', 'Solar and wind energy systems installation and maintenance.', '2025-09-05', 'Hyderabad Convention Centre', 'Hyderabad', 55, 8999, 'Workshop', 'REAP');
    `);
    console.log('[DB] Sample events seeded.');
  }

  console.log('[DB] Initialized successfully.');
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/me - Get current logged-in user
app.get('/api/me', rateLimit({ max: 60 }), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.json({ user: null });
    }
    const user = await db.get('SELECT id, name, email, phone, city FROM users WHERE id = ?', req.session.userId);
    res.json({ user });
  } catch (err) {
    console.error('[GET /api/me]', err);
    res.status(500).json({ error: 'Failed to get user.' });
  }
});

// POST /api/logout - Clear session
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Logout error]', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('eventhub.sid');
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// GET /api/events
app.get('/api/events', rateLimit({ max: 60 }), async (req, res) => {
  try {
    const { category, city, search } = req.query;
    let query = `SELECT * FROM events WHERE status = 'upcoming' AND date >= date('now')`;
    const params = [];

    if (category && category !== 'all') {
      const allowed = ['Workshop', 'Training', 'Conference', 'Certification'];
      if (!allowed.includes(category)) return res.status(400).json({ error: 'Invalid category' });
      query += ' AND category = ?';
      params.push(category);
    }
    if (city && city !== 'all') {
      if (!isValidCity(city)) return res.status(400).json({ error: 'Invalid city' });
      query += ' AND city = ?';
      params.push(city);
    }
    if (search) {
      if (typeof search !== 'string' || search.length > 100) return res.status(400).json({ error: 'Invalid search query' });
      query += ' AND (title LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY date ASC';
    const events = await db.all(query, params);
    res.json(events);
  } catch (err) {
    console.error('[GET /api/events]', err);
    res.status(500).json({ error: 'Failed to load events.' });
  }
});

// GET /api/cities
app.get('/api/cities', rateLimit({ max: 30 }), async (req, res) => {
  try {
    const cities = await db.all('SELECT DISTINCT city FROM events ORDER BY city');
    res.json(cities);
  } catch (err) {
    console.error('[GET /api/cities]', err);
    res.status(500).json({ error: 'Failed to load cities.' });
  }
});

// POST /api/users — upsert profile AND create session
app.post('/api/users', rateLimit({ max: 10 }), async (req, res) => {
  try {
    const { name, email, phone, city } = req.body || {};

    if (!isValidName(name))  return res.status(400).json({ error: 'Invalid name.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email address.' });
    if (!isValidPhone(phone)) return res.status(400).json({ error: 'Invalid phone number.' });
    if (city && !isValidCity(city)) return res.status(400).json({ error: 'Invalid city.' });

    const cleanEmail = email.toLowerCase().trim();
    const cleanName  = name.trim();
    const cleanPhone = phone.trim();
    const cleanCity  = (city || '').trim();

    await db.run(
      `INSERT INTO users (name, email, phone, city)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         name  = excluded.name,
         phone = excluded.phone,
         city  = excluded.city`,
      [cleanName, cleanEmail, cleanPhone, cleanCity]
    );

    const user = await db.get('SELECT * FROM users WHERE email = ?', cleanEmail);
    
    // Create session for the user
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    req.session.userName = user.name;
    
    res.json({ success: true, user });
  } catch (err) {
    console.error('[POST /api/users]', err);
    res.status(500).json({ error: 'Failed to save profile.' });
  }
});

// POST /api/registrations (Uses session, no need to pass email)
app.post('/api/registrations', rateLimit({ max: 10 }), async (req, res) => {
  try {
    const { eventId, ticketsCount } = req.body || {};
    
    // Get user from session
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Please save your profile first.' });
    }

    if (!Number.isInteger(eventId))      return res.status(400).json({ error: 'Invalid event ID.' });
    if (!isValidTicketCount(ticketsCount)) return res.status(400).json({ error: 'Ticket count must be between 1 and 5.' });

    await db.run('BEGIN IMMEDIATE');
    try {
      const user = await db.get('SELECT id, name FROM users WHERE id = ?', req.session.userId);
      if (!user) {
        await db.run('ROLLBACK');
        return res.status(400).json({ error: 'User not found. Please save your profile first.' });
      }

      const event = await db.get('SELECT * FROM events WHERE id = ?', eventId);
      if (!event) {
        await db.run('ROLLBACK');
        return res.status(404).json({ error: 'Event not found.' });
      }

      if (event.status !== 'upcoming') {
        await db.run('ROLLBACK');
        return res.status(400).json({ error: 'This event is no longer accepting registrations.' });
      }

      const available = event.capacity - event.registered_count;
      if (available < ticketsCount) {
        await db.run('ROLLBACK');
        return res.status(400).json({ error: `Only ${available} seat${available === 1 ? '' : 's'} available.` });
      }

      const existing = await db.get(
        `SELECT id FROM registrations WHERE user_id = ? AND event_id = ? AND status = 'confirmed'`,
        [user.id, eventId]
      );
      if (existing) {
        await db.run('ROLLBACK');
        return res.status(409).json({ error: 'You are already registered for this event.' });
      }

      const totalAmount = event.price * ticketsCount;

      const result = await db.run(
        `INSERT INTO registrations (user_id, event_id, tickets_count, total_amount)
         VALUES (?, ?, ?, ?)`,
        [user.id, eventId, ticketsCount, totalAmount]
      );

      await db.run(
        `UPDATE events SET registered_count = registered_count + ? WHERE id = ?`,
        [ticketsCount, eventId]
      );

      await db.run('COMMIT');

      console.log(`[REG] ${user.name} → "${event.title}" x${ticketsCount}`);

      res.status(201).json({
        success: true,
        message: `Registered for ${event.title}! Total: PKR ${totalAmount.toLocaleString()}`,
        registrationId: result.lastID,
      });
    } catch (innerErr) {
      await db.run('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    console.error('[POST /api/registrations]', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// GET /api/users/me/registrations (Uses session)
app.get('/api/users/me/registrations', rateLimit({ max: 30 }), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.json([]);
    }

    const registrations = await db.all(
      `SELECT r.id, r.tickets_count, r.total_amount, r.registration_date,
              e.title, e.date, e.location, e.city, e.category, e.price
       FROM registrations r
       JOIN events e ON r.event_id = e.id
       WHERE r.user_id = ? AND r.status = 'confirmed'
       ORDER BY e.date ASC`,
      req.session.userId
    );

    res.json(registrations);
  } catch (err) {
    console.error('[GET /api/users/me/registrations]', err);
    res.status(500).json({ error: 'Failed to load registrations.' });
  }
});

// DELETE /api/registrations/:id (Uses session)
app.delete('/api/registrations/:id', rateLimit({ max: 10 }), async (req, res) => {
  try {
    const regId = parseInt(req.params.id, 10);
    if (!Number.isInteger(regId) || regId <= 0) return res.status(400).json({ error: 'Invalid registration ID.' });

    if (!req.session.userId) {
      return res.status(401).json({ error: 'Please log in.' });
    }

    await db.run('BEGIN IMMEDIATE');
    try {
      const registration = await db.get(
        `SELECT * FROM registrations WHERE id = ? AND status = 'confirmed'`,
        regId
      );
      if (!registration) {
        await db.run('ROLLBACK');
        return res.status(404).json({ error: 'Registration not found.' });
      }

      // Verify ownership
      if (registration.user_id !== req.session.userId) {
        await db.run('ROLLBACK');
        return res.status(403).json({ error: 'You do not have permission to cancel this registration.' });
      }

      await db.run(`UPDATE registrations SET status = 'cancelled' WHERE id = ?`, regId);
      await db.run(
        `UPDATE events
         SET registered_count = MAX(0, registered_count - ?)
         WHERE id = ?`,
        [registration.tickets_count, registration.event_id]
      );

      await db.run('COMMIT');
      res.json({ success: true, message: 'Registration cancelled.' });
    } catch (innerErr) {
      await db.run('ROLLBACK');
      throw innerErr;
    }
  } catch (err) {
    console.error('[DELETE /api/registrations/:id]', err);
    res.status(500).json({ error: 'Failed to cancel registration.' });
  }
});

// GET /api/stats
app.get('/api/stats', rateLimit({ max: 30 }), async (req, res) => {
  try {
    const [allEvents, upcoming, registrations, users] = await Promise.all([
      db.get(`SELECT COUNT(*) as count FROM events`),
      db.get(`SELECT COUNT(*) as count FROM events WHERE date >= date('now') AND status = 'upcoming'`),
      db.get(`SELECT COUNT(*) as count FROM registrations WHERE status = 'confirmed'`),
      db.get(`SELECT COUNT(*) as count FROM users`),
    ]);

    res.json({
      totalEvents:        allEvents.count,
      upcomingEvents:     upcoming.count,
      totalRegistrations: registrations.count,
      totalUsers:         users.count,
    });
  } catch (err) {
    console.error('[GET /api/stats]', err);
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

app.get('*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

// ─── Startup & Graceful Shutdown ──────────────────────────────────────────────

let server;

async function start() {
  await initDB();
  server = app.listen(PORT, () => {
    console.log(`[Server] EventHub PK running on http://localhost:${PORT}`);
    console.log(`[Session] Cookie-based sessions enabled - users stay logged in`);
  });
}

async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    if (db) await db.close();
    console.log('[Server] Closed. Goodbye.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

start();