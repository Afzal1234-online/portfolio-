​3D Artist Portfolio - Telegram CMS (v1.6 - External Links)
​This is a complete, production-ready portfolio website for a 3D artist, where all content—media, profile info, and contact details—is managed entirely from a private Telegram bot.
​This version uses a 100% free cloud database (Neon) to permanently fix the "resetting page" problem. It also adds support for large video files from Google Drive and YouTube, and lets you edit media details after uploading.
​1. How to Deploy (or Update)
​Get Your Free Database URL (One-Time Setup):
​Go to Neon.tech and sign up (use Google/GitHub, no card needed).
​Create a new project.
​On your project dashboard, click the white "Connect" button (top-right).
​In the popup, find the "Connection string" and "Copy snippet". This is your DATABASE_URL.
​Update GitHub:
​Go to your GitHub repository.
​Delete all 4 old files (server.js, package.json, README.md, and the public folder).
​Upload all 4 NEW files I just gave you (v1.6). Make sure the structure is correct:
​package.json (v1.6)
​server.js (v1.6)
​README.md (v1.6)
​public/ (folder)
​index.html (v1.6)
​Update Render:
​Go to your Render dashboard -> Afzal portfolio- -> "Environment" tab.
​Make sure you have these 4 secrets. Delete and re-paste the DATABASE_URL to be sure it's the correct one from Neon.
​TELEGRAM_BOT_TOKEN: (Your bot token)
​ADMIN_CHAT_ID: (Your user ID)
​HOST_URL: https://afzal-portfolio-8rlx.onrender.com
​DATABASE_URL: (Your new postgres://... string from Neon)
​Render will automatically see your new code on GitHub and redeploy. You can force this by clicking "Manual Deploy" -> "Clear build cache & deploy".
​Your site is now upgraded and will never reset again.
​2. How to Use (New Commands)
​How to Add Large Videos (New!)
​To add a video that is larger than 20MB, first upload it to Google Drive or YouTube, then send a command to your bot.
​Command Format:
add <link> <category> [project_name]
​1. How to get a Google Drive Link:
​Upload your video to Google Drive.
​Right-click the file -> "Share" -> "Share".
​Change "Restricted" to "Anyone with the link" (with "Viewer" access).
​Click "Copy link".
​Send to your bot: add https://drive.google.com/file/d/123... stall MyStallProject
​2. How to get a YouTube Link:
​Upload your video to YouTube (you can make it "Unlisted").
​Open the video and click the "Share" button.
​Click "Copy" to get the link.
​Send to your bot: add https://youtu.be/456... anamorphic AnamorphicReel
​How to Edit Media (New!)
​First, get the ID of the media you want to edit by using the list command.
​Command Format:
edit title <id> <new project name>
edit desc <id> <new description>
​Example:
​You send list and see:
*MyProject* (youtube / anamorphic)
Cap: N/A
ID: \youtube-123456``
​To add a description, you send:
edit desc youtube-123456 This is my 2025 anamorphic reel.
​The bot will reply "✅ Media... updated." and your site will update instantly.
​3. Full Command List (v1.6)
​Content Updates:
​set name <Your Name>
​set title <Your Title>
​set desc <Your Description>
​set phone <+91...> (WhatsApp)
​set call <+91...> ("Call Now")
​set email <your@email.com>
​Media Uploads:
​Send a Photo or Video (for files < 20MB).
​Caption with profile photo to update profile pic.
​add <link> <category> [project_name] (for large videos from G-Drive/YouTube)
​Media Management:
​list - Show ALL media items and IDs.
​delete <id> - Remove media.
​edit title <id> <new title>
​edit desc <id> <new description>
​Site Management:
​pause / resume
​Security:
​block <ip> / unblock <ip> / listblocked