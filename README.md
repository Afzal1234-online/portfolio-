​3D Artist Portfolio - Telegram CMS (v1.4 - Persistent)
​This is a complete, production-ready portfolio website for a 3D artist, where all content—media, profile info, and contact details—is managed entirely from a private Telegram bot.
​This version solves the database-reset problem by saving your database to a persistent disk.
​New Features in v1.4
​Persistent Database: Your data (profile, media, settings) will now survive server restarts and sleep cycles.
​Pause/Resume Site: New pause and resume commands to take your site offline.
​Advanced Click Tracking: Get a Telegram notification when a visitor clicks any image or video.
​Visitor Notifications: Get a Telegram message with the visitor's IP when they first load or refresh your site.
​IP Blocking: Admin commands block <ip>, unblock <ip>, and listblocked.
​"CALL Now" Button: Replaced the "Telegram" contact card.
​1. How to Deploy (or Update)
​This is the most important part. You must follow these steps to add the Free Disk (permanent memory) to your project.
​Step 1: Upload the New Code to GitHub
​Go to your GitHub repository.
​Delete all the old files (server.js, package.json, README.md, and the public folder).
​Upload the 4 new files I just gave you (v1.4) in the correct structure:
​package.json
​server.js
​README.md
​public/ (folder)
​index.html (inside public)
​Step 2: Add a Free Disk on Render
​Go to your Render dashboard.
​Click on your service name (e.g., afzal-portfolio-8rlx).
​On the left-hand menu, click "Disks".
​Click the "Add Disk" button.
​Fill out the form exactly like this:
​Name: my-data-disk (or any name)
​Mount Path: ./.data  <--- This is critical!
​Size (GB): 1 (This is the smallest and is free)
​Click "Save".
​Step 3: Wait and Redeploy
​After you save the disk, Render will automatically redeploy your server.
​Go to the "Logs" tab to watch.
​You will see a new line in the logs: Database is now persistently stored at: ./.data/portfolio.sqlite
​Once it says "Your service is live", your site is permanently fixed.
​From now on, your database will never be deleted again.
​2. How to Use (Telegram Commands)
​All commands are sent as messages to your bot from your admin account.
​Content Updates:
​set name <Your Name>
​set title <Your Title>
​set desc <Your Description>
​set phone <+91...> (This is for the WhatsApp button)
​set call <+91...> (This is for the "Call Now" button)
​set email <your@email.com>
​Media Uploads:
​Send a Photo or Video to upload it.
​Caption with anamorphic, stall, or event to categorize it.
​Caption with profile photo to update your site's profile picture.
​Media Management:
​list
​Shows ALL media items and their IDs.
​delete <file_unique_id>
​Removes media from the site.
​Site Management:
​pause
​Shows a "Under Maintenance" page to all visitors.
​resume
​Makes your website live again.
​Security:
​block <ip>
​Blocks an IP address from visiting your site.
​unblock <ip>
​Unblocks an IP address.
​listblocked
​Shows all IPs you have blocked.