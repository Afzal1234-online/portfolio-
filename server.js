// --- server.js (v1.9) ---
// This is the backend for your portfolio.
// It connects to a persistent cloud database (Neon) to save all data.
// NEW: Adds a conversational /addbatch command for uploading multiple links.

// --- Imports ---
const express = require('express');
const http = require('http');
const path = require('path');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// --- Environment Variable Validation ---
const {
  TELEGRAM_BOT_TOKEN,
  ADMIN_CHAT_ID,
  PORT = 3000,
  HOST_URL,
  DATABASE_URL // This is the Neon connection string
} = process.env;

if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID || !HOST_URL || !DATABASE_URL) {
  console.error('Missing critical environment variables!');
  console.error('Please provide TELEGRAM_BOT_TOKEN, ADMIN_CHAT_ID, HOST_URL, and DATABASE_URL.');
  process.exit(1);
}

// --- App & Server Setup ---
const app = express();
const server = http.createServer(app);
app.use(express.json());
app.set('trust proxy', true);

// --- Database Setup (PostgreSQL) ---
const db = new Pool({
  connectionString: DATABASE_URL,
});

// --- Helper: Run database schema setup ---
async function initializeDatabase() {
  console.log('Connecting to database...');
  try {
    // Media table
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
    
    // Config table
    await db.query(`
      CREATE TABLE IF NOT EXISTS site_config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    
    // Audit log table
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        action TEXT NOT NULL,
        details TEXT
      );
    `);
    
    // IP block table
    await db.query(`
      CREATE TABLE IF NOT EXISTS blocked_ips (
        ip TEXT PRIMARY KEY
      );
    `);
    
    // User state table
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_state (
        chat_id TEXT PRIMARY KEY,
        state TEXT DEFAULT 'idle',
        context TEXT
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
      site_status: 'live'
    };
    const configQuery = `INSERT INTO site_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`;
    for (const [key, value] of Object.entries(initialConfig)) {
      await db.query(configQuery, [key, value]);
    }
    console.log('Database schema initialized.');
  } catch (err) {
    console.error('Database initialization error:', err.stack);
    process.exit(1);
  }
}

// --- IP Blocking Setup ---
let blockedIPs = new Set();
async function loadBlockedIPs() {
  try {
    const { rows } = await db.query('SELECT ip FROM blocked_ips');
    blockedIPs = new Set(rows.map(row => row.ip));
    console.log(`Loaded ${blockedIPs.size} blocked IPs.`);
  } catch(e) {
    console.error("Error loading blocked IPs:", e.message);
  }
}

// --- User State Helper Functions ---
async function getUserState(chatId) {
  try {
    const { rows } = await db.query('SELECT state, context FROM user_state WHERE chat_id = $1', [String(chatId)]);
    if (rows.length > 0) {
      return rows[0];
    }
    return { state: 'idle', context: null };
  } catch (e) {
    console.error("Error getting user state:", e.message);
    return { state: 'idle', context: null };
  }
}

async function setUserState(chatId, state, context = null) {
  try {
    const query = `
      INSERT INTO user_state (chat_id, state, context) VALUES ($1, $2, $3)
      ON CONFLICT (chat_id) DO UPDATE SET state = $2, context = $3
    `;
    await db.query(query, [String(chatId), state, context]);
  } catch (e) {
    console.error("Error setting user state:", e.message);
  }
}

async function clearUserState(chatId) {
  await setUserState(chatId, 'idle', null);
}

// --- Other Helper Functions ---
async function getConfig() {
  try {
    const { rows } = await db.query('SELECT key, value FROM site_config');
    return rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  } catch (e) {
    console.error("Error getting config:", e.message);
    return {}; // Return empty config on error
  }
}

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
  
  const categoryWords = ['anamorphic', 'event', 'stall', 'general'];
  const firstWordLower = words.length > 0 ? words[0].toLowerCase() : '';
  
  if (words.length > 1 && categoryWords.includes(firstWordLower)) {
    projectName = words.slice(1).join(' '); // Use rest of caption as project name
  } else if (words.length > 0) {
    projectName = words.join(' '); // Use whole caption as project name
  }
  
  // Basic capitalization
  if (projectName) {
      projectName = projectName.charAt(0).toUpperCase() + projectName.slice(1);
  }

  return { category, projectName: projectName.replace(/[^a-zA-Z0-9\s]/g, '') }; // Allow spaces
}

function parseExternalLink(link) {
  try {
    const url = new URL(link);
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      const videoId = url.hostname.includes('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v');
      if (!videoId) return null;
      return { type: 'youtube', id: videoId, unique_id: `youtube-${videoId}` };
    }
    if (url.hostname.includes('drive.google.com')) {
      const parts = url.pathname.split('/');
      const fileId = parts.find((part, index) => parts[index - 1] === 'd');
      if (!fileId) return null;
      return { type: 'gdrive', id: fileId, unique_id: `gdrive-${fileId}` };
    }
  } catch (e) { console.error('Link parsing error:', e.message); return null; }
  return null;
}

// --- Middleware (Pause, IP Block, Visitor Notify) ---
app.use(async (req, res, next) => {
  if (req.path.startsWith('/api/webhook/')) return next();
  try {
    const config = await getConfig();
    if (config.site_status === 'paused') {
      logAction('SITE_PAUSED', `Blocked request to ${req.path} from ${req.ip}`);
      return res.status(503).send(
        `<html lang="en"><head><title>Under Maintenance</title><style>body{font-family:sans-serif;background:#050507;color:#e0e0e0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;}div{text-align:center;border:1px solid rgba(255,255,255,0.1);padding:40px;border-radius:16px;background:rgba(16,16,22,0.6);}h1{color:#fff;}p{color:#888;}</style></head><body><div><h1>Site Under Maintenance</h1><p>This portfolio is temporarily offline. Please check back soon.</p></div></body></html>`
      );
    }
    next();
  } catch(e) {
    next(); // Fail open if config check fails
  }
});

app.use((req, res, next) => {
  const ip = req.ip;
  if (blockedIPs.has(ip)) {
    logAction('BLOCKED_ACCESS', `Blocked IP: ${ip}`);
    return res.status(403).send('Forbidden');
  }
  next();
});

const recentIPs = new Set();
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    const ip = req.ip;
    if (ip && !recentIPs.has(ip)) {
      notifyAdmin(`🔔 Page View / Refresh\nFrom IP: \`${ip}\``);
      recentIPs.add(ip);
      setTimeout(() => recentIPs.delete(ip), 3600000); // 1 hour cooldown
    }
  }
  next();
});
// --- End Middleware ---


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
  const chatId = String(msg.chat.id);
  const { state } = await getUserState(chatId);
  const photo = msg.photo[msg.photo.length - 1];
  const fileId = photo.file_id;
  const fileUniqueId = photo.file_unique_id;

  // Check if we are waiting for a profile photo
  if (state === 'awaiting_profilephoto') {
    await updateConfig('profile_photo_file_id', fileId);
    logAction('PROFILE_PHOTO_UPDATE', `New FileID: ${fileId}`);
    await clearUserState(chatId);
    return bot.sendMessage(chatId, '✅ Profile photo updated!');
  }

  // Otherwise, treat it as a normal media upload
  const caption = msg.caption || '';
  logAction('PHOTO_RECEIVED', `FileID: ${fileId}, Caption: ${caption}`);
  
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
    bot.sendMessage(chatId, `✅ Photo added to "${category}" gallery.`);
  } catch (e) {
    console.error('DB Error adding photo:', e.message);
    bot.sendMessage(chatId, `❌ Error adding photo: ${e.message}`);
  }
});

bot.on('video', async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;
  // This is a normal media upload (for <20MB files)
  const chatId = String(msg.chat.id);
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
    bot.sendMessage(chatId, `✅ Video added to "${category}" gallery.`);
  } catch (e) {
    console.error('DB Error adding video:', e.message);
    bot.sendMessage(chatId, `❌ Error adding video: ${e.message}`);
  }
});


// --- Telegram Text Command Handler (v1.9) ---
bot.on('text', async (msg) => {
  if (!isAuthorized(msg.chat.id)) return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const { state, context } = await getUserState(chatId);

  // --- Part 1: Handle / Commands (Setting the state) ---
  if (text.startsWith('/')) {
    logAction('COMMAND_RECEIVED', `"${text}"`);
    const [command, ...args] = text.split(' ');
    
    // Clear state on any new command, just in case
    await clearUserState(chatId); 

    switch (command.toLowerCase()) {
      case '/start':
      case '/help':
        const helpText = `
👋 Welcome, Admin!
You can use the menu button [/] to see commands.

*Profile Commands:*
- \`/setname\` - Update your profile name
- \`/settitle\` - Update your profile title
- \`/setdesc\` - Update your profile description
- \`/setphone\` - Update WhatsApp number
- \`/setcall\` - Update "Call Now" number
- \`/setemail\` - Update your email
- \`/profilephoto\` - Update your profile photo

*Media Uploads:*
- Send a *Photo* or *Video* (<20MB) to upload it.
- \`/add\` - Add a *single* G-Drive/YouTube video.
- \`/addbatch\` - **(NEW)** Add *multiple* links at once.

*Media Management:*
- \`/list\` - Show ALL media items and IDs.
- \`/delete\` - Remove media
- \`/edittitle\` - Edit media title
- \`/editdesc\` - Edit media description

*Site Management:*
- \`/pause\` - Show "Under Maintenance"
- \`/resume\` - Make website live

*Security:*
- \`/block\` - Block an IP
- \`/unblock\` - Unblock an IP
- \`/listblocked\` - List all blocked IPs
        `;
        return bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });

      // --- Profile Commands ---
      case '/setname':
        await setUserState(chatId, 'awaiting_name');
        return bot.sendMessage(chatId, 'OK, send me the new name.');
      case '/settitle':
        await setUserState(chatId, 'awaiting_title');
        return bot.sendMessage(chatId, 'OK, send me the new title.');
      case '/setdesc':
        await setUserState(chatId, 'awaiting_desc');
        return bot.sendMessage(chatId, 'OK, send me the new description.');
      case '/setphone':
        await setUserState(chatId, 'awaiting_phone');
        return bot.sendMessage(chatId, 'OK, send me the new WhatsApp number.');
      case '/setcall':
        await setUserState(chatId, 'awaiting_call');
        return bot.sendMessage(chatId, 'OK, send me the new "Call Now" number.');
      case '/setemail':
        await setUserState(chatId, 'awaiting_email');
        return bot.sendMessage(chatId, 'OK, send me the new email address.');
      case '/profilephoto':
        await setUserState(chatId, 'awaiting_profilephoto');
        return bot.sendMessage(chatId, 'OK, send me the new profile photo.');

      // --- Media Commands ---
      case '/add':
        await setUserState(chatId, 'awaiting_add_link');
        return bot.sendMessage(chatId, 'OK, send me the link (YouTube or G-Drive).');
      
      case '/addbatch':
        await setUserState(chatId, 'awaiting_batch_links');
        return bot.sendMessage(chatId, 'OK, paste your list of links (YouTube or G-Drive), one link per line.');

      case '/delete':
        await setUserState(chatId, 'awaiting_delete_id');
        return bot.sendMessage(chatId, 'OK, send me the ID of the media to delete.\n(You can get the ID from `/list`)');
      case '/edittitle':
        await setUserState(chatId, 'awaiting_edittitle_id');
        return bot.sendMessage(chatId, 'OK, send me the ID of the media to edit.\n(You can get the ID from `/list`)');
      case '/editdesc':
        await setUserState(chatId, 'awaiting_editdesc_id');
        return bot.sendMessage(chatId, 'OK, send me the ID of the media to edit.\n(You can get the ID from `/list`)');
      
      case '/list':
        try {
          const { rows } = await db.query('SELECT file_unique_id, type, category, caption, project_name FROM media ORDER BY timestamp DESC');
          if (rows.length === 0) return bot.sendMessage(chatId, 'No media found.');
          const list = rows.map(m => `*${m.project_name || 'Project'}* (${m.type} / ${m.category})\nCap: ${m.caption || 'N/A'}\nID: \`${m.file_unique_id}\``).join('\n\n');
          return bot.sendMessage(chatId, `*All Media (${rows.length} items):*\n\n${list}`, { parse_mode: 'Markdown' });
        } catch (e) {
          return bot.sendMessage(chatId, `❌ Error listing: ${e.message}`);
        }
      case '/block':
        await setUserState(chatId, 'awaiting_block_ip');
        return bot.sendMessage(chatId, 'OK, send me the IP address to block.');
      case '/unblock':
        await setUserState(chatId, 'awaiting_unblock_ip');
        return bot.sendMessage(chatId, 'OK, send me the IP address to unblock.');
      case '/listblocked':
        const ips = Array.from(blockedIPs);
        if (ips.length === 0) return bot.sendMessage(chatId, 'No IPs are currently blocked.');
        return bot.sendMessage(chatId, `*Blocked IPs:*\n\`${ips.join('\n')}\``, { parse_mode: 'Markdown' });
      case '/pause':
        await updateConfig('site_status', 'paused');
        logAction('SITE_PAUSE', 'Site paused by admin');
        return bot.sendMessage(chatId, '⏸️ Website is now PAUSED.');
      case '/resume':
        await updateConfig('site_status', 'live');
        logAction('SITE_RESUME', 'Site resumed by admin');
        return bot.sendMessage(chatId, '▶️ Website is now LIVE.');

      default:
        return bot.sendMessage(chatId, '❓ Unknown command. Type /help to see all commands.');
    }
  }

  // --- Part 2: Handle plain text (Fulfilling the state) ---
  if (state === 'idle') {
    // User sent plain text without a command.
    // This is where media album uploads might send text.
    // We will just ignore it and ask for a command.
    logAction('IDLE_TEXT', `Ignoring: "${text}"`);
    return bot.sendMessage(chatId, '❓ Send a command starting with / (e.g., /help).');
  }

  try {
    let clearState = true; // By default, clear state after processing
    switch (state) {
      // --- Profile States ---
      case 'awaiting_name':
        await updateConfig('profile_name', text);
        await bot.sendMessage(chatId, `✅ Name updated to: ${text}`);
        break;
      case 'awaiting_title':
        await updateConfig('profile_title', text);
        await bot.sendMessage(chatId, `✅ Title updated to: ${text}`);
        break;
      case 'awaiting_desc':
        await updateConfig('profile_desc', text);
        await bot.sendMessage(chatId, '✅ Description updated!');
        break;
      case 'awaiting_phone':
        await updateConfig('contact_phone_1', text);
        await bot.sendMessage(chatId, `✅ WhatsApp Phone updated to: ${text}`);
        break;
      case 'awaiting_call':
        await updateConfig('contact_call', text);
        await bot.sendMessage(chatId, `✅ Call Now Phone updated to: ${text}`);
        break;
      case 'awaiting_email':
        await updateConfig('contact_email', text);
        await bot.sendMessage(chatId, `✅ Email updated to: ${text}`);
        break;

      // --- Single Add States ---
      case 'awaiting_add_link':
        const parsedLink = parseExternalLink(text);
        if (!parsedLink) {
          return bot.sendMessage(chatId, `❌ Invalid Link. Only YouTube and Google Drive links are supported.\nPlease send me a valid link, or send /help to cancel.`);
        }
        await setUserState(chatId, 'awaiting_add_category', JSON.stringify(parsedLink));
        clearState = false; // We are transitioning to the next state
        return bot.sendMessage(chatId, `OK, link received. Now, what *category* is this video? (e.g., \`anamorphic\`, \`event\`, \`stall\`, or \`general\`)`);
      
      case 'awaiting_add_category':
        const { type, id: fileId, unique_id: fileUniqueId } = JSON.parse(context);
        const category = text.toLowerCase();
        await setUserState(chatId, 'awaiting_add_project', JSON.stringify({ fileId, fileUniqueId, type, category }));
        clearState = false; // Transitioning
        return bot.sendMessage(chatId, `OK, category is "${category}". Finally, what is the *project name* for this video?`);
      
      case 'awaiting_add_project':
        const { fileId: f, fileUniqueId: fu, type: t, category: c } = JSON.parse(context);
        const projectName = text;
        const { category: parsedCat, projectName: parsedProj } = parseMediaCaption(c + ' ' + projectName);
        await db.query(
          `INSERT INTO media (file_unique_id, file_id, type, category, project_name, caption) VALUES ($1, $2, $3, $4, $5, '') ON CONFLICT (file_unique_id) DO UPDATE SET file_id = $2, type = $3, category = $4, project_name = $5`,
          [fu, f, t, parsedCat, parsedProj]
        );
        logAction('MEDIA_ADD_LINK', `Type: ${t}, ID: ${f}, Category: ${parsedCat}`);
        broadcastUpdate();
        await bot.sendMessage(chatId, `✅ ${t} video added to "${parsedCat}" gallery!`);
        break;
        
      // --- Batch Add States ---
      case 'awaiting_batch_links':
        const links = text.split('\n').map(link => parseExternalLink(link.trim())).filter(Boolean);
        if (links.length === 0) {
          return bot.sendMessage(chatId, `❌ I found 0 valid links. Only YouTube and Google Drive links are supported.\nPlease send me a valid list of links, or send /help to cancel.`);
        }
        await setUserState(chatId, 'awaiting_batch_category', JSON.stringify(links));
        clearState = false; // Transitioning
        return bot.sendMessage(chatId, `OK, I found ${links.length} valid links. Now, what *category* should this batch be? (e.g., \`anamorphic\`, \`event\`, \`stall\`)`);
      
      case 'awaiting_batch_category':
        const batchLinks = JSON.parse(context);
        const batchCategory = text.toLowerCase();
        await setUserState(chatId, 'awaiting_batch_project', JSON.stringify({ links: batchLinks, category: batchCategory }));
        clearState = false; // Transitioning
        return bot.sendMessage(chatId, `OK, category is "${batchCategory}". Finally, what is the *project name* for this whole batch?`);
      
      case 'awaiting_batch_project':
        const { links: finalLinks, category: finalCategory } = JSON.parse(context);
        const finalProjectName = text;
        const { category: finalParsedCat, projectName: finalParsedProj } = parseMediaCaption(finalCategory + ' ' + finalProjectName);
        
        const client = await db.connect();
        try {
          await client.query('BEGIN');
          const query = `
            INSERT INTO media (file_unique_id, file_id, type, category, project_name, caption)
            VALUES ($1, $2, $3, $4, $5, '')
            ON CONFLICT (file_unique_id) DO UPDATE SET
              file_id = $2, type = $3, category = $4, project_name = $5
          `;
          for (const link of finalLinks) {
            await client.query(query, [link.unique_id, link.id, link.type, finalParsedCat, finalParsedProj]);
          }
          await client.query('COMMIT');
          
          logAction('MEDIA_ADD_BATCH', `Added ${finalLinks.length} items. Category: ${finalParsedCat}, Project: ${finalParsedProj}`);
          broadcastUpdate();
          await bot.sendMessage(chatId, `✅ Success! ${finalLinks.length} items added to "${finalParsedCat}" under project "${finalParsedProj}".`);
          
        } catch (e) {
          await client.query('ROLLBACK');
          console.error('DB Batch Insert Error:', e.message);
          await bot.sendMessage(chatId, `❌ Error adding batch: ${e.message}`);
        } finally {
          client.release();
        }
        break;

      // --- Other States (Delete, Edit, Block) ---
      case 'awaiting_delete_id':
        const { rowCount } = await db.query('DELETE FROM media WHERE file_unique_id = $1', [text]);
        if (rowCount > 0) {
          logAction('MEDIA_DELETE', `FileUniqueID: ${text}`);
          broadcastUpdate();
          await bot.sendMessage(chatId, `✅ Media ${text} deleted.`);
        } else {
          await bot.sendMessage(chatId, `❌ Media ${text} not found. Send another ID, or /help to cancel.`);
          clearState = false; // Keep waiting for a valid ID
        }
        break;
      case 'awaiting_edittitle_id':
        await setUserState(chatId, 'awaiting_edittitle_value', text); // Save the ID in context
        clearState = false; // Transitioning
        return bot.sendMessage(chatId, `OK, editing media ${text}. What is the new *title*?`);
      case 'awaiting_edittitle_value':
        await db.query(`UPDATE media SET project_name = $1 WHERE file_unique_id = $2`, [text, context]);
        logAction('MEDIA_EDIT', `ID: ${context}, Field: project_name`);
        broadcastUpdate();
        await bot.sendMessage(chatId, `✅ Media ${context} title updated.`);
        break;
      case 'awaiting_editdesc_id':
        await setUserState(chatId, 'awaiting_editdesc_value', text); // Save the ID in context
        clearState = false; // Transitioning
        return bot.sendMessage(chatId, `OK, editing media ${text}. What is the new *description*?`);
      case 'awaiting_editdesc_value':
        await db.query(`UPDATE media SET caption = $1 WHERE file_unique_id = $2`, [text, context]);
        logAction('MEDIA_EDIT', `ID: ${context}, Field: caption`);
        broadcastUpdate();
        await bot.sendMessage(chatId, `✅ Media ${context} description updated.`);
        break;
      case 'awaiting_block_ip':
        await db.query('INSERT INTO blocked_ips (ip) VALUES ($1) ON CONFLICT (ip) DO NOTHING', [text]);
        blockedIPs.add(text);
        logAction('IP_BLOCK', `IP: ${text}`);
        await bot.sendMessage(chatId, `🚫 IP ${text} blocked.`);
        break;
      case 'awaiting_unblock_ip':
        const { rowCount: unblockCount } = await db.query('DELETE FROM blocked_ips WHERE ip = $1', [text]);
        blockedIPs.delete(text);
        logAction('IP_UNBLOCK', `IP: ${text}`);
        if (unblockCount > 0) await bot.sendMessage(chatId, `✅ IP ${text} unblocked.`);
        else await bot.sendMessage(chatId, `🤷 IP ${text} was not found.`);
        break;
      
      case 'awaiting_profilephoto':
        // This state only accepts a photo.
        await bot.sendMessage(chatId, 'I am waiting for a photo. Please send me an image file, or send /help to cancel.');
        clearState = false; // Keep waiting
        break;

      default:
        await bot.sendMessage(chatId, 'I was waiting for something, but I am confused. Send /help to start over.');
    }
    
    // If we successfully handled the state, clear it.
    if (clearState) {
      await clearUserState(chatId);
    }

  } catch (e) {
    console.error('State Handler Error:', e.message);
    await bot.sendMessage(chatId, `❌ An error occurred: ${e.message}. Send /help to start over.`);
    await clearUserState(chatId);
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
        // If file is expired or invalid, remove it
        if (e.message.includes('400')) {
           try {
               await db.query('DELETE FROM media WHERE file_id = $1', [fileId]);
               logAction('MEDIA_DELETE_STALE', `FileID: ${fileId}`);
               broadcastUpdate(); // Notify clients to refetch
           } catch (dbErr) {
               console.error("Error deleting stale media:", dbErr.message);
           }
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
        let url = null;
        switch(item.type) {
          case 'photo':
          case 'video':
            url = await getFileUrl(item.file_id);
            break;
          case 'youtube':
            url = `https://www.youtube.com/embed/${item.file_id}`;
            break;
          case 'gdrive':
            url = `https://drive.google.com/file/d/${item.file_id}/preview`;
            break;
        }
        if (!url) return null; // Don't include media if URL failed
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
      media: enrichedMedia.filter(Boolean) // Filter out any nulls
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
  } else if (mediaType === 'youtube' || mediaType === 'gdrive') {
    logAction('VIDEO_CLICK', `IP: ${ip}, Project: ${project}, Caption: ${caption}`);
    notifyAdmin(`▶️ External Video Clicked: *${project || 'Video'}*\n(Type: ${mediaType})\nFrom IP: \`${ip}\``);
  } else {
    logAction('PHOTO_CLICK', `IP: ${ip}, Project: ${project}, Caption: ${caption}`);
    notifyAdmin(`🖼️ Image Clicked: *${project || 'Image'}*\n(Caption: ${caption || 'N/A'})\nFrom IP: \`${ip}\``);
  }
  res.sendStatus(200);
});

// Fallback for client-side routing (handles refresh)
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