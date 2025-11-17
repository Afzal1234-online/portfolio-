​3D Artist Portfolio - Telegram CMS (v1.7 - /Commands)
​This is a complete, production-ready portfolio website for a 3D artist, where all content—media, profile info, and contact details—is managed entirely from a private Telegram bot.
​This version uses a 100% free cloud database (Neon) to permanently fix the "resetting page" problem.
​NEW (v1.7): All commands now start with / so you can set up an easy-to-use command list in Telegram.
​1. How to Deploy (or Update to v1.7)
​Get Your Free Database URL (One-Time Setup):
​Go to Neon.tech and sign up (use Google/GitHub, no card needed).
​Create a new project.
​On your project dashboard, click the white "Connect" button (top-right).
​In the popup, find the "Connection string" and "Copy snippet". This is your DATABASE_URL.
​Update GitHub:
​Go to your GitHub repository.
​Delete all 4 old files (v1.6 or older).
​Upload all 4 NEW files I just gave you (v1.7). Make sure the structure is correct:
​package.json (v1.7)
​server.js (v1.7)
​README.md (v1.7)
​public/ (folder)
​index.html (v1.7)
​Update Render:
​Go to your Render dashboard -> Afzal portfolio- -> "Environment" tab.
​Make sure you have these 4 secrets.
​TELEGRAM_BOT_TOKEN: (Your bot token)
​ADMIN_CHAT_ID: (Your user ID)
​HOST_URL: https://afzal-portfolio-8rlx.onrender.com
​DATABASE_URL: (Your postgres://... string from Neon)
​Click "Manual Deploy" -> "Clear build cache & deploy" to force the update.
​Your site is now upgraded and will never reset again.
​2. NEW: How to Set Up Bot Commands (Easy Menu)
​To get the easy-to-use / menu in your Telegram chat:
​Open Telegram and go to the @BotFather bot.
​Send the command /mybots.
​Select your portfolio bot.
​Click "Edit Bot" -> "Edit Commands".
​Paste the entire block of text below into the chat:
​<!-- end list -->