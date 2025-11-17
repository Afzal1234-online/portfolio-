​3D Artist Portfolio - Telegram CMS (v1.5 - Cloud DB)
​This is a complete, production-ready portfolio website for a 3D artist, where all content—media, profile info, and contact details—is managed entirely from a private Telegram bot.
​This version uses a 100% free cloud database (Neon) to permanently fix the "resetting page" problem. No credit card is required.
​1. How to Deploy (The New, Permanent Fix)
​You will do this one time.
​Step 1: Get Your Free Database URL from Neon (No Card Needed)
​Go to Neon.tech and click "Sign up".
​Sign up with Google. This is the fastest way and requires no credit card.
​After signup, it will ask you to create a project.
​Project Name: my-portfolio (or any name)
​Click "Create Project".
​Wait 10 seconds. You will see your "Project Dashboard".
​In the center, find the "Connection Details" box.
​Look for the "Connection string" and click the "Copy" icon. It looks like this:
postgres://afzal:A1b2...etc@...
​This is your DATABASE_URL. You have now fixed the "memory" problem.
​Step 2: Upload the New Code (v1.5) to GitHub
​Go to your GitHub repository.
​Delete all 4 old files (server.js, package.json, README.md, and the public folder).
​Upload all 4 NEW files I just gave you (v1.5). Make sure the structure is correct:
​package.json (v1.5)
​server.js (v1.5)
​README.md (v1.5)
​public/ (folder)
​index.html (v1.5)
​Step 3: Update Your Secrets on Render
​Go to your Render dashboard.
​Click on your service name (e.g., afzal-portfolio-8rlx).
​On the left menu, click "Environment".
​You do not need "Disks" anymore! We are using Neon.
​You must add your new secret:
​Click "+ Add Environment Variable".
​Key: DATABASE_URL
​Value: Paste your Neon connection string (the one you copied in Step 1).
​You still need your other 3 secrets:
​TELEGRAM_BOT_TOKEN (your bot token)
​ADMIN_CHAT_ID (your ID)
​HOST_URL (your Render URL: https://afzal-portfolio-8rlx.onrender.com)
​That's it! Render will automatically restart with the new code. It will connect to your permanent Neon database, and your website will never reset again.
​2. How to Use (Telegram Commands)
​All commands are sent as messages to your bot from your admin account.
​Content Updates:
​set name <Your Name>
​set title <Your Title>
​set desc <Your Description>
​set phone <+91...> (WhatsApp number)
​set call <+91...> ("Call Now" number)
​set email <your@email.com>
​Media Uploads:
​Send a Photo or Video to upload it.
​Caption with anamorphic, stall, or event to categorize it.
​Caption with profile photo to update your site's profile picture.
​Media Management:
​list - Show ALL media items and their IDs.
​delete <file_unique_id> - Remove media from the site.
​Site Management:
​pause - Show a "Under Maintenance" page to all visitors.
​resume - Makes your website live again.
​Security:
​block <ip>
​unblock <ip>
​listblocked