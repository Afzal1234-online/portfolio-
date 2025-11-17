// --- server.js (v1.5) ---
// This is the backend for your portfolio.
// It connects to a persistent cloud database (Neon) to save all data.

// --- Imports ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Pool } = require('pg'); // NEW: Import PostgreSQL driver
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config(); // Load .env variables

// --- Environment Variable Validation ---
const {
  TELEGRAM_BOT_TOKEN,
  ADMIN_CHAT_ID,
  PORT = 3000,
  HOST_URL,
  DATABASE_URL // NEW: This is the Neon connection string
} = process.env;

if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID || !HOST_URL || !DATABASE_URL) {
  console.error('Missing critical environment variables!');
  console.log('Please check your Render environment settings. You need:');
  console.log('TELEGRAM_BOT_TOKEN');
  console.log('ADMIN_CHAT_ID');
  console.log('HOST_URL');
  console.log('DATABASE_URL (from Neon)');
  process.exit(1);
}

// --- App & Server Setup ---
const app = express();
const server = http.createServer(app);
app.use(express.json()); // For parsing Telegram webhook

// --- Trust Proxy ---
app.set('trust proxy', true);

// --- Database Setup (PostgreSQL) ---
// Use the Neon connection string from environment variables
const db = new Pool({
  connectionString: DATABASE_URL,
});

// --- Helper: Run database schema setup ---
async function initializeDatabase() {
  console.log('Connecting to database...');
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS site_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS media (
        file_unique_id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        project_name TEXT,
        caption TEXT,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        action TEXT NOT NULL,
        details TEXT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS blocked_ips (
        ip TEXT PRIMARY KEY
      );
    `);

    // Initialize Site Config with Defaults
    const initialConfig = {
      profile_name: 'Mohammed Afzal',
      profile_title: '3D Artist | Exhibition Stalls | Anamorphic Videos | Motion Graphics',
      profile_desc: 'Passionate 3D Artist specializing in immersive experiences. From high-impact exhibition stalls to mind-bending anamorphic content, I bring digital concepts to life.',
      profile_photo_file_id: '',
      contact_phone_1: '+91 9036526421',
      contact_email: 'afzal24052002@gmail.com',
      contact_call: '+91 9036526421',
      site_status: 'live' // 'live' or 'paused'
    };

    // Use INSERT ... ON CONFLICT DO NOTHING to avoid overwriting existing config
    const configQuery = `INSERT INTO site_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`;
    for (const [key, value] of Object.entries(initialConfig)) {
      await db.query(configQuery, [key, value]);
    }
    
    console.log('Database schema initialized.');
  } catch (err) {
    console.error('Database initialization error:', err.stack);
    process.exit(1); // Exit if database fails
  }
}

// --- IP Blocking Setup ---
let blockedIPs = new Set();
async function loadBlockedIPs() {
  const { rows } = await db.query('SELECT ip FROM blocked_ips');
  blockedIPs = new Set(rows.map(row => row.ip));
  console.log(`Loaded ${blockedIPs.size} blocked IPs.`);
}

// --- Helper Functions (getConfig must be async now) ---
async function getConfig() {
  const { rows } = await db.query('SELECT key, value FROM site_config');
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

// --- Site Status Middleware (Pause/Resume) ---
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/webhook/')) {
    return next();
  }
  const config = await getConfig();
  if (config.site_status === 'paused') {
    logAction('SITE_PAUSED', `Blocked request to ${req.path} from ${req.ip}`);
    return res.status(503).send(
      `<html lang="en"><head><title>Under Maintenance</title><style>body{font-family:sans-serif;background:#050507;color:#e0e0e0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}div{text-align:center;border:1px solid rgba(255,255,255,0.1);padding:40px;border-radius:16px;background:rgba(16,16,22,0.6);}h1{color:#fff;}p{color:#888;}</style></head><body><div><h1>Site Under Maintenance</h1><p>This portfolio is temporarily offline. Please check back soon.</p></div></body></html>`
    );
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
async function logAction(action, details = '') {
  try {
    await db.query('INSERT INTO audit_log (action, details) VALUES ($1, $2)', [action, details]);
    console.log(`LOG: ${action} - ${details}`);
  } catch (e) {
    console.error('Audit Log Error:', e.message);
  }
}
function notifyAdmin(message) {
  try {
    bot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: 'Markdown', disable_notification: false });
  } catch (e) {
    console.error('Notify Admin Error:', e.message);
  }
}
async function updateConfig(key, value) {
  try {
    // INSERT ... ON CONFLICT (key) DO UPDATE ...
    const query = `
      INSERT INTO site_config (key, value) VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = $2
    `;
    await db.query(query, [key, value]);
    logAction('CONFIG_UPDATE', `${key} = ${value}`);
    broadcastUpdate();
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
  if (req.path === '/' || req.path === '/index.html') {
    const ip = req.ip;
    if (ip && !recentIPs.has(ip)) {
      notifyAdmin(`🔔 Page View / Refresh\nFrom IP: \`${ip}\``);
      recentIPs.add(ip);
      setTimeout(() => recentIPs.delete(ip), 3600000);
    }
  }
  next();
});

// --- Static Frontend ---
app.use(express.static(path.join(__dirname, 'public')));

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
    await updateConfig('profile_photo_file_id', fileId);
    logAction('PROFILE_PHOTO_UPDATE', `New FileID: ${fileId}`);
    return bot.sendMessage(msg.chat.id, '✅ Profile photo updated!');
  }
  const { category, projectName } = parseMediaCaption(caption);
  try {
    const query = `
      INSERT INTO media (file_unique_id, file_id, type, category, project_name, caption)
      VALUES ($1, $2, 'photo', $3, $4, $5)
      ON CONFLICT (file_unique_id) DO UPDATE SET
        file_id = $2, category = $3, project_name = $4, caption = $5
    `;
    await db.query(query, [fileUniqueId, fileId, category, projectName, msg.caption || '']);
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
    const query = `
      INSERT INTO media (file_unique_id, file_id, type, category, project_name, caption)
      VALUES ($1, $2, 'video', $3, $4, $5)
      ON CONFLICT (file_unique_id) DO UPDATE SET
        file_id = $2, category = $3, project_name = $4, caption = $5
    `;
    await db.query(query, [fileUniqueId, fileId, category, projectName, msg.caption || '']);
    logAction('MEDIA_ADD_VIDEO', `FileID: ${fileId}, Category: ${category}`);
    broadcastUpdate();
    bot.sendMessage(msg.chat.id, `✅ Video added to "${category}" gallery.`);
  } catch (e) {
    console.error('DB Error adding video:', e.message);
    bot.sendMessage(msg.chat.id, `❌ Error adding video: ${e.message}`);
  }
});

// --- Telegram Text Command Handler ---
bot.on('text', async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;
  const text = msg.text.trim();
  const [command, ...args] = text.split(' ');
  const value = args.join(' ');
  logAction('COMMAND_RECEIVED', `"${text}"`);

  switch (command.toLowerCase()) {
    case 'update':
    case 'set':
      const [subCommand, ...subArgs] = args;
      const subValue = subArgs.join(' ');
      if (!subValue) return bot.sendMessage(msg.chat.id, `Usage: set <key> <value>`);
      switch(subCommand.toLowerCase()) {
        case 'phone':
          await updateConfig('contact_phone_1', subValue);
          return bot.sendMessage(msg.chat.id, `✅ WhatsApp Phone updated to: ${subValue}`);
        case 'call':
          await updateConfig('contact_call', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Call Now Phone updated to: ${subValue}`);
        case 'email':
          await updateConfig('contact_email', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Email updated to: ${subValue}`);
        case 'desc':
          await updateConfig('profile_desc', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Description updated!`);
        case 'name':
          await updateConfig('profile_name', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Name updated to: ${subValue}`);
        case 'title':
          await updateConfig('profile_title', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Title updated to: ${subValue}`);
      }
      return bot.sendMessage(msg.chat.id, `Unknown set command: "${subCommand}".`);
    
    case 'delete':
    case 'remove':
      const fileUniqueId = args[0];
      if (!fileUniqueId) return bot.sendMessage(msg.chat.id, 'Usage: delete <file_unique_id>');
      try {
        const { rowCount } = await db.query('DELETE FROM media WHERE file_unique_id = $1', [fileUniqueId]);
        if (rowCount > 0) {
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
        const { rows } = await db.query('SELECT file_unique_id, category, caption, project_name FROM media ORDER BY timestamp DESC');
        if (rows.length === 0) return bot.sendMessage(msg.chat.id, 'No media found.');
        const list = rows.map(m => `*${m.project_name || 'Project'}* (${m.category})\nCap: ${m.caption || 'N/A'}\nID: \`${m.file_unique_id}\``).join('\n\n');
        return bot.sendMessage(msg.chat.id, `*All Media (${rows.length} items):*\n\n${list}`, { parse_mode: 'Markdown' });
      } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Error listing: ${e.message}`);
      }

    case 'block':
      const ipToBlock = args[0];
      if (!ipToBlock) return bot.sendMessage(msg.chat.id, 'Usage: `block <ip_address>`');
      try {
        await db.query('INSERT INTO blocked_ips (ip) VALUES ($1) ON CONFLICT (ip) DO NOTHING', [ipToBlock]);
        blockedIPs.add(ipToBlock);
        logAction('IP_BLOCK', `IP: ${ipToBlock}`);
        return bot.sendMessage(msg.chat.id, `🚫 IP ${ipToBlock} blocked.`);
      } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Error blocking IP: ${e.message}`);
      }

    case 'unblock':
      const ipToUnblock = args[0];
      if (!ipToUnblock) return bot.sendMessage(msg.chat.id, 'Usage: `unblock <ip_address>`');
      try {
        const { rowCount } = await db.query('DELETE FROM blocked_ips WHERE ip = $1', [ipToUnblock]);
        blockedIPs.delete(ipToUnblock);
        logAction('IP_UNBLOCK', `IP: ${ipToUnblock}`);
        if (rowCount > 0) return bot.sendMessage(msg.chat.id, `✅ IP ${ipToUnblock} unblocked.`);
        else return bot.sendMessage(msg.chat.id, `🤷 IP ${ipToUnblock} was not found.`);
      } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Error unblocking IP: ${e.message}`);
      }

    case 'listblocked':
      const ips = Array.from(blockedIPs);
      if (ips.length === 0) return bot.sendMessage(msg.chat.id, 'No IPs are currently blocked.');
      return bot.sendMessage(msg.chat.id, `*Blocked IPs:*\n\`${ips.join('\n')}\``, { parse_mode: 'Markdown' });
    
    case 'pause':
      await updateConfig('site_status', 'paused');
      logAction('SITE_PAUSE', 'Site paused by admin');
      return bot.sendMessage(msg.chat.id, '⏸️ Website is now PAUSED.');
    
    case 'resume':
      await updateConfig('site_status', 'live');
      logAction('SITE_RESUME', 'Site resumed by admin');
      return bot.sendMessage(msg.chat.id, '▶️ Website is now LIVE.');

    case '/start':
    case 'help':
      const helpText = `
👋 Welcome, Admin!

*Content Updates:*
- \`set name <Your Name>\`
- \`set title <Your Title>\`
- \`set desc <Your Description>\`
- \`set phone <+91...>\` (WhatsApp)
- \`set call <+91...>\` ("Call Now")
- \`set email <your@email.com>\`

*Media Uploads:*
- Send a *Photo* or *Video*.
- Caption with *'anamorphic'*, *'stall'*, *'event'* to categorize.
- Caption with *'profile photo'* to update profile pic.

*Media Management:*
- \`list\` - Show ALL media items and IDs.
- \`delete <file_unique_id>\` - Remove media.

*Site Management:*
- \`pause\` - Show "Under Maintenance" page.
- \`resume\` - Make site live again.

*Security:*
- \`block <ip>\`
- \`unblock <ip>\`
- \`listblocked\`
      `;
      return bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });

    default:
      return bot.sendMessage(msg.chat.id, '❓ Unknown command. Type `help`.');
  }
});

// --- API Endpoints ---
app.post(`/api/webhook/${TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.get('/api/sse', sseHandler);
app.get('/api/content', async (req, res) => {
  try {
    const config = await getConfig();
    const { rows: media } = await db.query('SELECT * FROM media ORDER BY timestamp DESC');
    const getFileUrl = async (fileId) => {
      try {
        return await bot.getFileLink(fileId);
      } catch (e) {
        console.warn(`Could not get URL for file_id ${fileId}: ${e.message}`);
        logAction('FILE_LINK_ERROR', `FileID: ${fileId}, Error: ${e.message}`);
        if (e.message.includes('400')) {
           await db.query('DELETE FROM media WHERE file_id = $1', [fileId]);
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
app.post('/api/notify-click', (req, res) => {
  const ip = req.ip;
  const { mediaType, project, caption } = req.body;
  if (mediaType === 'video') {
    logAction('VIDEO_CLICK', `IP: ${ip}, Project: ${project}, Caption: ${caption}`);
    notifyAdmin(`▶️ Video Clicked: *${project || 'Video'}*\n(Caption: ${caption || 'N/A'})\nFrom IP: \`${ip}\``);
  } else {
    logAction('PHOTO_CLICK', `IP: ${ip}, Project: ${project}, Caption: ${caption}`);
    notifyAdmin(`🖼️ Image Clicked: *${project || 'Image'}*\n(Caption: ${caption || 'N/A'})\nFrom IP: \`${ip}\``);
  }
  res.sendStatus(200);
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server ---
async function startServer() {
  await initializeDatabase();
  await loadBlockedIPs();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    logAction('SERVER_START');
  });
}

startServer();