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
  console.log('Please check your .env file. You need:');
  console.log('TELEGRAM_BOT_TOKEN');
  console.log('ADMIN_CHAT_ID (Your personal Telegram ID)');
  console.log('HOST_URL (e.g., https://your-app-name.onrender.com)');
  process.exit(1);
}

// --- App & Server Setup ---
const app = express();
const server = http.createServer(app);
app.use(express.json()); // For parsing Telegram webhook
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend

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
`);

// --- Initialize Site Config with Defaults ---
// This runs on every start, ensuring config exists.
const initialConfig = {
  profile_name: 'Mohammed Afzal',
  profile_title: '3D Artist | Exhibition Stalls | Anamorphic Videos | Motion Graphics',
  profile_desc: 'Passionate 3D Artist specializing in immersive experiences. From high-impact exhibition stalls to mind-bending anamorphic content, I bring digital concepts to life.',
  profile_photo_file_id: '', // Empty by default
  contact_phone_1: '+91 9036526421',
  contact_email: 'afzal24052002@gmail.com',
  contact_telegram: 'https://t.me/your_bot_username_here', // Update this
};

const stmt = db.prepare('INSERT OR IGNORE INTO site_config (key, value) VALUES (?, ?)');
const trans = db.transaction((config) => {
  for (const [key, value] of Object.entries(config)) {
    stmt.run(key, value);
  }
});
trans(initialConfig);

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
  } catch (e) {
    console.error('Audit Log Error:', e.message);
  }
}

function getConfig() {
  const rows = db.prepare('SELECT key, value FROM site_config').all();
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function updateConfig(key, value) {
  try {
    db.prepare('INSERT OR REPLACE INTO site_config (key, value) VALUES (?, ?)').run(key, value);
    logAction('CONFIG_UPDATE', `${key} = ${value}`);
    broadcastUpdate();
    return true;
  } catch (e) {
    console.error('Config Update Error:', e.message);
    return false;
  }
}

function parseMediaCaption(caption = '') {
  caption = caption.toLowerCase();
  let category = 'general';
  if (caption.includes('anamorphic')) category = 'anamorphic';
  else if (caption.includes('event')) category = 'event';
  else if (caption.includes('stall')) category = 'stall';

  // Simple project name extraction: assumes "category [ProjectName] ..."
  // e.g., "anamorphic ClientX" -> project_name: "ClientX"
  const words = (caption || '').split(' ');
  let projectName = '';
  if (words.length > 1 && ['anamorphic', 'event', 'stall'].includes(words[0])) {
    projectName = words[1];
    // Capitalize it
    projectName = projectName.charAt(0).toUpperCase() + projectName.slice(1);
  }

  return { category, projectName };
}

// --- Telegram Bot Setup ---
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

// Set Webhook
const webhookUrl = `${HOST_URL}/api/webhook/${TELEGRAM_BOT_TOKEN}`;
bot.setWebHook(webhookUrl)
  .then(() => console.log(`Webhook set successfully to ${webhookUrl}`))
  .catch((err) => console.error('Webhook Error:', err.message));


// --- Telegram Message Handlers ---

// Handle Photo Uploads
bot.on('photo', async (msg) => {
  if (String(msg.chat.id) !== ADMIN_CHAT_ID) {
    return bot.sendMessage(msg.chat.id, 'Sorry, this is a private bot.');
  }

  const caption = msg.caption || '';
  const photo = msg.photo[msg.photo.length - 1]; // Get largest size
  const fileId = photo.file_id;
  const fileUniqueId = photo.file_unique_id;

  logAction('PHOTO_RECEIVED', `ChatID: ${msg.chat.id}, FileID: ${fileId}, Caption: ${caption}`);

  // Check for "profile photo" command
  if (caption.toLowerCase().includes('profile photo')) {
    updateConfig('profile_photo_file_id', fileId);
    logAction('PROFILE_PHOTO_UPDATE', `New FileID: ${fileId}`);
    return bot.sendMessage(msg.chat.id, '✅ Profile photo updated!');
  }

  // Process as regular media
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

// Handle Video Uploads
bot.on('video', async (msg) => {
  if (String(msg.chat.id) !== ADMIN_CHAT_ID) {
    return bot.sendMessage(msg.chat.id, 'Sorry, this is a private bot.');
  }

  const caption = msg.caption || '';
  const fileId = msg.video.file_id;
  const fileUniqueId = msg.video.file_unique_id;
  
  logAction('VIDEO_RECEIVED', `ChatID: ${msg.chat.id}, FileID: ${fileId}, Caption: ${caption}`);

  // Process as regular media
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

// Handle Text Commands
bot.on('text', (msg) => {
  if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;

  const text = msg.text.trim();
  const [command, ...args] = text.split(' ');
  const value = args.join(' ');

  logAction('COMMAND_RECEIVED', text);

  switch (command.toLowerCase()) {
    case 'update':
    case 'set':
      const [subCommand, ...subArgs] = args;
      const subValue = subArgs.join(' ');
      
      if (!subValue) {
        return bot.sendMessage(msg.chat.id, `Usage: set <key> <value>`);
      }

      switch(subCommand.toLowerCase()) {
        case 'phone':
          updateConfig('contact_phone_1', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Phone updated to: ${subValue}`);
        case 'email':
          updateConfig('contact_email', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Email updated to: ${subValue}`);
        case 'description':
        case 'desc':
          updateConfig('profile_desc', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Description updated!`);
        case 'name':
          updateConfig('profile_name', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Name updated to: ${subValue}`);
        case 'title':
          updateConfig('profile_title', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Title updated to: ${subValue}`);
        case 'telegram':
          updateConfig('contact_telegram', subValue);
          return bot.sendMessage(msg.chat.id, `✅ Telegram link updated to: ${subValue}`);
      }
      return bot.sendMessage(msg.chat.id, `Unknown set command: "${subCommand}"`);

    case 'delete':
    case 'remove':
      const fileUniqueId = args[0];
      if (!fileUniqueId) {
        return bot.sendMessage(msg.chat.id, 'Usage: delete <file_unique_id>');
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
        const media = db.prepare('SELECT file_unique_id, category, caption FROM media ORDER BY timestamp DESC LIMIT 10').all();
        if (media.length === 0) {
          return bot.sendMessage(msg.chat.id, 'No media found.');
        }
        const list = media.map(m => `ID: ${m.file_unique_id}\nCat: ${m.category}\nCap: ${m.caption || 'N/A'}`).join('\n\n');
        return bot.sendMessage(msg.chat.id, `Last 10 Media:\n\n${list}`);
      } catch (e) {
        return bot.sendMessage(msg.chat.id, `❌ Error listing: ${e.message}`);
      }

    case '/start':
    case 'help':
      const helpText = `
👋 Welcome, Admin!

Here are your commands:

*Media Uploads:*
- Send a *Photo* or *Video* to upload it.
- Caption with *'anamorphic'*, *'stall'*, or *'event'* to categorize.
- Caption with *'profile photo'* to update your site's profile picture.

*Content Updates:*
- \`set name <Your Name>\`
- \`set title <Your Title>\`
- \`set desc <Your Description>\`
- \`set phone <+91...>\`
- \`set email <your@email.com>\`
- \`set telegram <https://t.me/...>\`

*Media Management:*
- \`list\` - Show the 10 most recent media items with their IDs.
- \`delete <file_unique_id>\` - Remove media from the site (get the ID from \`list\`).
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

    // Get a temporary, usable URL for each media item's file_id
    // This is the most complex part. We must do this on the server.
    const getFileUrl = async (fileId) => {
      try {
        // node-telegram-bot-api's getFileLink returns a full, temporary URL
        return await bot.getFileLink(fileId);
      } catch (e) {
        console.warn(`Could not get URL for file_id ${fileId}: ${e.message}`);
        logAction('FILE_LINK_ERROR', `FileID: ${fileId}, Error: ${e.message}`);
        // If a file is deleted from Telegram, getFileLink will fail.
        // We should probably remove it from the DB here.
        if (e.message.includes('400')) {
           db.prepare('DELETE FROM media WHERE file_id = ?').run(fileId);
           logAction('MEDIA_DELETE_STALE', `FileID: ${fileId}`);
           // No need to broadcast, the content payload will just not include it.
        }
        return null; // Don't include this media item
      }
    };
    
    // Enrich profile photo
    let profile_photo_url = 'https://placehold.co/300x300/1a1a20/e0e0e0?text=Profile'; // Default
    if (config.profile_photo_file_id) {
      profile_photo_url = await getFileUrl(config.profile_photo_file_id);
    }

    // Enrich all media items
    const enrichedMedia = await Promise.all(
      media.map(async (item) => {
        const url = await getFileUrl(item.file_id);
        if (!url) return null; // Skip items that failed to get a URL
        return {
          ...item,
          url: url,
        };
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
        telegram: config.contact_telegram,
        whatsapp_link: `https://wa.me/${config.contact_phone_1.replace(/[^0-9]/g, '')}`
      },
      media: enrichedMedia.filter(Boolean) // Filter out any null (failed) items
    });
  } catch (e) {
    console.error('API Error /api/content:', e.message);
    logAction('API_ERROR', `/api/content: ${e.message}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. Serve Frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start Server ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  logAction('SERVER_START');
});


