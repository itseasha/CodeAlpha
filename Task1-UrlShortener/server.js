const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let db;

// Initialize Database
async function initDB() {
  db = await open({
    filename: './urls.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      short_code TEXT UNIQUE NOT NULL,
      long_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      clicks INTEGER DEFAULT 0
    )
  `);
  
  console.log('✅ Database initialized');
}

// API: Shorten URL
app.post('/api/shorten', async (req, res) => {
  try {
    const { longUrl } = req.body;
    
    if (!longUrl) {
      return res.status(400).json({ error: 'Long URL is required' });
    }
    
    // Validate URL format
    try {
      new URL(longUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    // Check if URL already exists
    const existing = await db.get('SELECT short_code FROM urls WHERE long_url = ?', longUrl);
    if (existing) {
      const shortUrl = `http://localhost:${PORT}/${existing.short_code}`;
      return res.json({ success: true, shortUrl, shortCode: existing.short_code, longUrl, isExisting: true });
    }
    
    // Generate unique short code
    let shortCode = nanoid(6);
    let exists = await db.get('SELECT id FROM urls WHERE short_code = ?', shortCode);
    while (exists) {
      shortCode = nanoid(6);
      exists = await db.get('SELECT id FROM urls WHERE short_code = ?', shortCode);
    }
    
    // Save to database
    await db.run('INSERT INTO urls (short_code, long_url) VALUES (?, ?)', [shortCode, longUrl]);
    
    const shortUrl = `http://localhost:${PORT}/${shortCode}`;
    
    res.json({
      success: true,
      shortUrl,
      shortCode,
      longUrl,
      isExisting: false
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Get all URLs
app.get('/api/urls', async (req, res) => {
  try {
    const urls = await db.all('SELECT * FROM urls ORDER BY created_at DESC');
    res.json(urls);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Get URL stats
app.get('/api/stats/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;
    const stats = await db.get(
      'SELECT short_code, long_url, clicks, created_at FROM urls WHERE short_code = ?',
      shortCode
    );
    
    if (!stats) {
      return res.status(404).json({ error: 'URL not found' });
    }
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Delete URL
app.delete('/api/urls/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;
    await db.run('DELETE FROM urls WHERE short_code = ?', shortCode);
    res.json({ success: true, message: 'URL deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Redirect Route
app.get('/:shortCode', async (req, res) => {
  try {
    const { shortCode } = req.params;
    
    const url = await db.get('SELECT long_url FROM urls WHERE short_code = ?', shortCode);
    
    if (!url) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>404 - URL Not Found</title></head>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h1>🔗 URL Not Found</h1>
          <p>The short link you're looking for doesn't exist.</p>
          <a href="/">Go to URL Shortener</a>
        </body>
        </html>
      `);
    }
    
    // Increment click count
    await db.run('UPDATE urls SET clicks = clicks + 1 WHERE short_code = ?', shortCode);
    
    res.redirect(url.long_url);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║   🔗 URL SHORTENER IS RUNNING         ║
    ╠═══════════════════════════════════════╣
    ║   Server: http://localhost:${PORT}      ║
    ║   API: http://localhost:${PORT}/api/urls ║
    ╚═══════════════════════════════════════╝
    `);
  });
}

startServer();