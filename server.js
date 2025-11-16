// --- server.js ---
// This is the backend for your portfolio.
// It handles Telegram commands, manages the database, and serves the frontend.

// --- Imports ---
const express = require('express');
const http = require('http');
const path = require('path');
const Database = require('better-sqlite3');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config(); // Load .env variables

// --- Environment Variable Validation ---
const {
  TELEGRAM_BOT_TOKEN,
  ADMIN_CHAT_ID,
  PORT = 3000,
  HOST_URL
} = process.env;

if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID || !HOST_URL) {
  console.error('Missing critical environment variables!');
  console.log('Please check your .env file or Render environment settings. You need:');
  console.log('TELEGRAM_BOT_TOKEN');
  console.log('ADMIN_CHAT_ID (Your personal Telegram ID)');
  console.log('HOST_URL (e.g., https://your-app-name.onrender.com)');
  process.exit(1);
}

// --- App & Server Setup ---
const app = express();
const server = http.createServer(app);
app.use(express.json()); // For parsing Telegram webhook

// --- Trust Proxy ---
// This is CRITICAL for getting the correct IP address on Render
app.set('trust proxy', true);

// --- Database Setup (SQLite) ---
const db = new Database('portfolio.sqlite');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS site_config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  
  CREATE TABLE IF NOT EXISTS media (
    file_unique_id TEXT PRIMARY KEY, -- From Telegram, permanently unique
    file_id TEXT NOT NULL,         -- From Telegram, used to re-fetch
    type TEXT NOT NULL,              -- 'photo' or 'video'
    category TEXT NOT NULL,        -- 'anamorphic', 'event', 'stall', 'general'
    project_name TEXT,
    caption TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    action TEXT NOT NULL,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY
  );
`);

// --- Initialize Site Config with Defaults ---
const initialConfig = {
  profile_name: 'Mohammed Afzal',
  profile_title: '3D Artist | Exhibition Stalls | Anamorphic Videos | Motion Graphics',
  profile_desc: 'Passionate 3D Artist specializing in immersive experiences. From high-impact exhibition stalls to mind-bending anamorphic content, I bring digital concepts to life.',
  profile_photo_file_id: '',
  contact_phone_1: '+91 9036526421',
  contact_email: 'afzal24052002@gmail.com',
  contact_call: '+91 9036526421',
  site_status: 'live' // NEW: 'live' or 'paused'
};

const stmt = db.prepare('INSERT OR IGNORE INTO site_config (key, value) VALUES (?, ?)');
const trans = db.transaction((config) => {
  for (const [key, value] of Object.entries(config)) {
    stmt.run(key, value);
  }
});
trans(initialConfig);
console.log('Database initialized.');

// --- IP Blocking Setup ---
let blockedIPs = new Set(db.prepare('SELECT ip FROM blocked_ips').all().map(row => row.ip));

// --- Helper Functions (getConfig must be defined before use) ---
function getConfig() {
  const rows = db.prepare('SELECT key, value FROM site_config').all();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

// --- NEW: Site Status Middleware (Pause/Resume) ---
app.use((req, res, next) => {
  // Allow Telegram webhook to pass through always
  if (req.path.startsWith('/api/webhook/')) {
    return next();
  }

  const config = getConfig();
  if (config.site_status === 'paused') {
    logAction('SITE_PAUSED', `Blocked request to ${req.path} from ${req.ip}`);
    // Send a simple "Under Maintenance" page
    return res.status(503).send(`
      <html lang="en">
        <head><title>Under Maintenance</title><style>body{font-family:sans-serif;background:#050507;color:#e0e0e0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}div{text-align:center;border:1px solid rgba(255,255,255,0.1);padding:40px;border-radius:16px;background:rgba(16,16,22,0.6);}h1{color:#fff;}p{color:#888;}</style></head>
        <body><div><h1>Site Under Maintenance</h1><p>This portfolio is temporarily offline. Please check back soon.</p></div></body>
      </html>
    `);
  }
  next();
});


// --- IP Blocking Middleware ---
app.use((req, res, next) => {
  const ip = req.ip;
  if (blockedIPs.has(ip)) {
    logAction('BLOCKED_ACCESS', `Blocked IP: ${ip}`);
    return res.status(403).send('Forbidden');
  }
  next();
});

// --- Server-Sent Events (SSE) Setup ---
let sseClients = [];

function sseHandler(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);
  logAction('SSE_CONNECT', `Client ${clientId} connected`);

  req.on('close', () => {
    sseClients = sseClients.filter(client => client.id !== clientId);
    logAction('SSE_DISCONNECT', `Client ${clientId} disconnected`);
  });
}

function broadcastUpdate() {
  logAction('SSE_BROADCAST', `Sending update to ${sseClients.length} clients`);
  for (const client of sseClients) {
    client.res.write('data: update\n\n');
  }
}

// --- Helper Functions ---
function logAction(action, details = '') {
  try {
    db.prepare('INSERT INTO audit_log (action, details) VALUES (?, ?)').run(action, details);
    console.log(`LOG: ${action} - ${details}`);
  } catch (e) {
    console.error('Audit Log Error:', e.message);
  }
}

// New function to send notifications to the admin
function notifyAdmin(message) {
  try {
    bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown', disable_notification: false });
  } catch (e) {
    console.error('Notify Admin Error:', e.message);
  }
}

// getConfig was moved up

function updateConfig(key, value) {
  try {
    db.prepare('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)').run(key, value);
    logAction('CONFIG_UPDATE', `${key} = ${value}`);
    broadcastUpdate(); // Tell frontend to refetch data
    return true;
  } catch (e) {
    console.error('Config Update Error:', e.message);
    return false;
  }
}

function parseMediaCaption(caption = '') {
  const lowerCaption = (caption || '').toLowerCase();
  let category = 'general';
  
  if (lowerCaption.includes('anamorphic')) category = 'anamorphic';
  else if (lowerCaption.includes('event')) category = 'event';
  else if (lowerCaption.includes('stall')) category = 'stall';

  const words = (caption || '').split(' ');
  let projectName = '';
  if (words.length > 1 && ['anamorphic', 'event', 'stall'].includes(words[0].toLowerCase())) {
    projectName = words[1];
    projectName = projectName.charAt(0).toUpperCase() + projectName.slice(1);
  } else if (words.length > 0) {
    projectName = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }

  return { category, projectName: projectName.replace(/[^a-zA-Z0-9]/g, '') };
}

// --- Visitor Notification Setup ---
const recentIPs = new Set();
app.use((req, res, next) => {
  // Only track main page loads, not API calls or assets
  if (req.path === '/' || req.path === '/index.html') {
    const ip = req.ip; 
    if (ip && !recentIPs.has(ip)) {
      // UPDATED: More descriptive notification
      notifyAdmin(`🔔 Page View / Refresh\nFrom IP: \`${ip}\``);
      recentIPs.add(ip);
      // Clear IP after 1 hour to allow re-notification
      setTimeout(() => recentIPs.delete(ip), 3600000); 
    }
  }
  next();
});


// --- Static Frontend ---
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend files

// --- Telegram Bot Setup ---
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const webhookUrl = `${HOST_URL}/api/webhook/${TELEGRAM_BOT_TOKEN}`;
bot.setWebHook(webhookUrl)
  .then(() => console.log(`Webhook set successfully to ${webhookUrl}`))
  .catch((err) => console.error('Webhook Error:', err.message));

function isAuthorized(chatId) {
  if (String(chatId) !== String(ADMIN_CHAT_ID)) {
    logAction('UNAUTHORIZED_ACCESS', `Attempt from ChatID: ${chatId}`);
    bot.sendMessage(chatId, 'Sorry, this is a private bot. You are not authorized.');
    return false;
  }
  return true;
}

// --- Telegram Handlers (Photo, Video) ---
bot.on('photo', async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;
  const caption = msg.caption || '';
  const photo = msg.photo[msg.photo.length - 1];
  const fileId = photo.file_id;
  const fileUniqueId = photo.file_unique_id;

  logAction('PHOTO_RECEIVED', `FileID: ${fileId}, Caption: ${caption}`);

  if (caption.toLowerCase().includes('profile photo') || caption.toLowerCase().includes('profile')) {
    updateConfig('profile_photo_file_id', fileId);
    logAction('PROFILE_PHOTO_UPDATE', `New FileID: ${fileId}`);
    return bot.sendMessage(msg.chat.id, '✅ Profile photo updated!');
  }

  const { category, projectName } = parseMediaCaption(caption);
  try {
    db.prepare(`
      INSERT OR REPLACE INTO media (file_unique_id, file_id, type, category, project_name, caption)
      VALUES (?, ?, 'photo', ?, ?, ?)
    `).run(fileUniqueId, fileId, category, projectName, msg.caption || '');
    
    logAction('MEDIA_ADD_PHOTO', `FileID: ${fileId}, Category: ${category}`);
    broadcastUpdate();
    bot.sendMessage(msg.chat.id, `✅ Photo added to "${category}" gallery.`);
  } catch (e) {
    console.error('DB Error adding photo:', e.message);
    bot.sendMessage(msg.chat.id, `❌ Error adding photo: ${e.message}`);
  }
});

bot.on('video', async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;
  const caption = msg.caption || '';
  const fileId = msg.video.file_id;
  const fileUniqueId = msg.video.file_unique_id;
  
  logAction('VIDEO_RECEIVED', `FileID: ${fileId}, Caption: ${caption}`);

  const { category, projectName } = parseMediaCaption(caption);
  try {
    db.prepare(`
      INSERT OR REPLACE INTO media (file_unique_id, file_id, type, category, project_name, caption)
      VALUES (?, ?, 'video', ?, ?, ?)
    `).run(fileUniqueId, fileId, category, projectName, msg.caption || '');
    
    logAction('MEDIA_ADD_VIDEO', `FileID: ${fileId}, Category: ${category}`);
    broadcastUpdate();
    bot.sendMessage(msg.chat.id, `✅ Video added to "${category}" gallery.`);
  } catch (e) {
    console.error('DB Error adding video:', e.message);
    bot.sendMessage(msg.chat.id, `❌ Error adding video: ${e.message}`);
  }
});

// --- Telegram Text Command Handler ---
bot.on('text', (msg) => {
  if (!isAuthorized(msg.chat.id)) return;

  const text = msg.text.trim();
  const [command, ...args] = text.split(' ');
  const value = args.join(' ');

  logAction('COMMAND_RECEIVED', `"${text}"`);

  switch (command.toLowerCase()) {
    // --- Set Commands ---
    case 'update':
    case 'set':
      const [subCommand, ...subArgs] = args;
      const subValue = subArgs.join(' ');
      
      if (!subValue) {
        return bot.sendMessage(msg.chat.id, `Usage: set <key> <value>\n(e.g., set phone +91...)`);
      }
      switch(subCommand.toLowerCase()) {
        case 'phone':
          updateConfig('contact_phone_1', subValue);
          return bot.sendMessage(msg.chat.id, `✅ WhatsApp Phone updated to: ${subValue}`);
        case 'call':
          updateConfig('contact_call', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Call Now Phone updated to: ${subValue}`);
        case 'email':
          updateConfig('contact_email', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Email updated to: ${subValue}`);
        case 'desc':
          updateConfig('profile_desc', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Description updated!`);
        case 'name':
          updateConfig('profile_name', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Name updated to: ${subValue}`);
        case 'title':
          updateConfig('profile_title', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Title updated to: ${subValue}`);
      }
      return bot.sendMessage(msg.chat.id, `Unknown set command: "${subCommand}". Try 'phone', 'call', 'email', 'desc', 'name', or 'title'.`);

    // --- Media Commands ---
    case 'delete':
    case 'remove':
      const fileUniqueId = args[0];
      if (!fileUniqueId) {
        return bot.sendMessage(msg.chat.id, 'Usage: delete <file_unique_id>\n(Get the ID from the `list` command)');
      }
      try {
        const res = db.prepare('DELETE FROM media WHERE file_unique_id = ?').run(fileUniqueId);
        if (res.changes > 0) {
          logAction('MEDIA_DELETE', `FileUniqueID: ${fileUniqueId}`);
          broadcastUpdate();
          return bot.sendMessage(msg.chat.id, `✅ Media ${fileUniqueId} deleted.`);
        } else {
          return bot.sendMessage(msg.chat.id, `❌ Media ${fileUniqueId} not found.`);
        }
      } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Error deleting: ${e.message}`);
      }
    
    case 'list':
      try {
        const media = db.prepare('SELECT file_unique_id, category, caption, project_name FROM media ORDER BY timestamp DESC').all();
        if (media.length === 0) {
          return bot.sendMessage(msg.chat.id, 'No media found.');
        }
        const list = media.map(m => `*${m.project_name || 'Project'}* (${m.category})\nCap: ${m.caption || 'N/A'}\nID: \`${m.file_unique_id}\``).join('\n\n');
        return bot.sendMessage(msg.chat.id, `*All Media (${media.length} items):*\n\n${list}`, { parse_mode: 'Markdown' });
      } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Error listing: ${e.message}`);
      }

    // --- IP Blocking Commands ---
    case 'block':
      const ipToBlock = args[0];
      if (!ipToBlock) {
        return bot.sendMessage(msg.chat.id, 'Usage: `block <ip_address>`');
      }
      try {
        db.prepare('INSERT OR IGNORE INTO blocked_ips (ip) VALUES (?)').run(ipToBlock);
        blockedIPs.add(ipToBlock); // Add to live set
        logAction('IP_BLOCK', `IP: ${ipToBlock}`);
        return bot.sendMessage(msg.chat.id, `🚫 IP ${ipToBlock} blocked.`);
      } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Error blocking IP: ${e.message}`);
      }

    case 'unblock':
      const ipToUnblock = args[0];
      if (!ipToUnblock) {
        return bot.sendMessage(msg.chat.id, 'Usage: `unblock <ip_address>`');
      }
      try {
        const res = db.prepare('DELETE FROM blocked_ips WHERE ip = ?').run(ipToUnblock);
        blockedIPs.delete(ipToUnblock); // Remove from live set
        logAction('IP_UNBLOCK', `IP: ${ipToUnblock}`);
        if (res.changes > 0) {
          return bot.sendMessage(msg.chat.id, `✅ IP ${ipToUnblock} unblocked.`);
        } else {
          return bot.sendMessage(msg.chat.id, `🤷 IP ${ipToUnblock} was not found in the block list.`);
        }
      } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Error unblocking IP: ${e.message}`);
      }

    case 'listblocked':
      const ips = Array.from(blockedIPs);
      if (ips.length === 0) {
        return bot.sendMessage(msg.chat.id, 'No IPs are currently blocked.');
      }
      return bot.sendMessage(msg.chat.id, `*Blocked IPs:*\n\`${ips.join('\n')}\``, { parse_mode: 'Markdown' });

    // --- NEW PAUSE/RESUME COMMANDS ---
    case 'pause':
      updateConfig('site_status', 'paused');
      logAction('SITE_PAUSE', 'Site paused by admin');
      return bot.sendMessage(msg.chat.id, '⏸️ Website is now PAUSED. Visitors will see the maintenance page.');

    case 'resume':
      updateConfig('site_status', 'live');
      logAction('SITE_RESUME', 'Site resumed by admin');
      return bot.sendMessage(msg.chat.id, '▶️ Website is now LIVE.');

    // --- Help Command ---
    case '/start':
    case 'help':
      const helpText = `
👋 Welcome, Admin!

*Content Updates:*
- \`set name <Your Name>\`
- \`set title <Your Title>\`
- \`set desc <Your Description>\`
- \`set phone <+91...>\` (WhatsApp number)
- \`set call <+91...>\` ("Call Now" number)
- \`set email <your@email.com>\`

*Media Uploads:*
- Send a *Photo* or *Video* to upload.
- Caption with *'anamorphic'*, *'stall'*, or *'event'* to categorize.
- Caption with *'profile photo'* to update your site's profile picture.

*Media Management:*
- \`list\` - Show ALL media items and their IDs.
- \`delete <file_unique_id>\` - Remove media from the site.

*Site Management (NEW):*
- \`pause\` - Show a maintenance page to visitors.
- \`resume\` - Make the site live again.

*Security:*
- \`block <ip>\` - Block an IP address.
- \`unblock <ip>\` - Unblock an IP address.
- \`listblocked\` - Show all blocked IPs.
      `;
      return bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });

    default:
      return bot.sendMessage(msg.chat.id, '❓ Unknown command. Type `help` to see all commands.');
  }
});

// --- API Endpoints ---

// 1. Webhook Receiver
app.post(`/api/webhook/${TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// 2. Server-Sent Events (SSE) Stream
app.get('/api/sse', sseHandler);

// 3. Get All Site Content
app.get('/api/content', async (req, res) => {
  try {
    const config = getConfig();
    const media = db.prepare('SELECT * FROM media ORDER BY timestamp DESC').all();

    const getFileUrl = async (fileId) => {
      try {
        return await bot.getFileLink(fileId);
      } catch (e) {
        console.warn(`Could not get URL for file_id ${fileId}: ${e.message}`);
        logAction('FILE_LINK_ERROR', `FileID: ${fileId}, Error: ${e.message}`);
        if (e.message.includes('400')) {
           db.prepare('DELETE FROM media WHERE file_id = ?').run(fileId);
           logAction('MEDIA_DELETE_STALE', `FileID: ${fileId}`);
           broadcastUpdate();
        }
        return null;
      }
    };
    
    let profile_photo_url = 'https://placehold.co/300x300/1a1a20/e0e0e0?text=Profile';
    if (config.profile_photo_file_id) {
      profile_photo_url = await getFileUrl(config.profile_photo_file_id);
    }

    const enrichedMedia = await Promise.all(
      media.map(async (item) => {
        const url = await getFileUrl(item.file_id);
        if (!url) return null;
        return { ...item, url: url };
      })
    );

    res.json({
      profile: {
        name: config.profile_name,
        title: config.profile_title,
        description: config.profile_desc,
        photo_url: profile_photo_url
      },
      contacts: {
        phone: config.contact_phone_1,
        email: config.contact_email,
        call: config.contact_call,
        whatsapp_link: `https://wa.me/${(config.contact_phone_1 || '').replace(/[^0-9]/g, '')}`
      },
      media: enrichedMedia.filter(Boolean)
    });
  } catch (e) {
    console.error('API Error /api/content:', e.message);
    logAction('API_ERROR', `/api/content: ${e.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. NEW: Handle Click Notifications
app.post('/api/notify-click', (req, res) => {
  const ip = req.ip;
  const { mediaType, project, caption } = req.body;

  if (mediaType === 'video') {
    logAction('VIDEO_CLICK', `IP: ${ip}, Project: ${project}, Caption: ${caption}`);
    // Send notification to admin
    notifyAdmin(`▶️ Video Clicked: *${project || 'Video'}*\n(Caption: ${caption || 'N/A'})\nFrom IP: \`${ip}\``);
  } else {
    // UPDATED: Handle photo clicks
    logAction('PHOTO_CLICK', `IP: ${ip}, Project: ${project}, Caption: ${caption}`);
    notifyAdmin(`🖼️ Image Clicked: *${project || 'Image'}*\n(Caption: ${caption || 'N/A'})\nFrom IP: \`${ip}\``);
  }
  
  res.sendStatus(200); // Send "OK" immediately
});


// 5. Serve Frontend (This MUST be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  logAction('SERVER_START');
});