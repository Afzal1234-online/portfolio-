3D Artist Portfolio - Telegram CMS (v1.1)

This is a complete, production-ready portfolio website for a 3D artist, where all content—media, profile info, and contact details—is managed entirely from a private Telegram bot.



This version includes visitor IP notifications and IP blocking.



New Features in v1.1

Visitor Notifications: Get a Telegram message with the visitor's IP when they load your site.

IP Blocking: New admin commands block <ip>, unblock <ip>, and listblocked to secure your site.

"CALL Now" Button: Replaced the "Telegram" contact card with a "Call Now" button.

Improved Media List: The list command now shows ALL media (not just 10) and formats IDs for easy copy/pasting.

Video Optimization: Videos now preload metadata for faster, smoother playback.

1\. How to Deploy (or Update)

Prerequisites

Node.js (v18 or later)

A Telegram Bot Token

Your Admin Chat ID

How to get your Telegram Bot Token \& Admin ID

Bot Token: Talk to @BotFather on Telegram. Send /newbot and follow the instructions.

Admin ID: Talk to @userinfobot on Telegram. It will reply with your Id.

Deployment Steps

Create Project Folder: On your computer, create a folder (e.g., my-portfolio).

Save Files:

Save package.json and server.js inside the my-portfolio folder.

Create a new folder inside my-portfolio called public.

Save index.html inside the public folder.

Upload to GitHub:

Create a new, public repository on GitHub (e.g., my-portfolio-website).

Click "Add file" -> "Upload files".

Drag and drop package.json, server.js, README.md and the entire public folder into the upload box.

Click "Commit changes".

Deploy to Render:

Sign up for Render.com using your GitHub account.

Click "New +" -> "Web Service" and connect your my-portfolio-website repository.

Use these settings:

Name: afzal-portfolio (or your choice)

Build Command: npm install

Start Command: npm start

Go to the "Environment" tab and add your 3 secrets:

Key: TELEGRAM\_BOT\_TOKEN, Value: 8252...

Key: ADMIN\_CHAT\_ID, Value: 7076...

Key: HOST\_URL, Value: httpsS://afzal-portfolio.onrender.com (Your Render URL)

Click "Create Web Service".

2\. How to Use (Telegram Commands)

All commands are sent as messages to your bot from your admin account.



Content Updates:

set name <Your Name>

set title <Your Title>

set desc <Your Description>

set phone <+91...> (This is for the WhatsApp button)

set call <+91...> (This is for the "Call Now" button)

set email <your@email.com>

Media Uploads:

Send a Photo or Video to upload it.

Caption with anamorphic, stall, or event to categorize it.

Caption with profile photo to update your site's profile picture.

Media Management:

list

Shows ALL media items and their IDs.

On mobile, you can tap the ID: to copy it.

delete <file\_unique\_id>

Removes media from the site. (Copy the ID from the list command).

Security (New!):

block <ip>

Blocks an IP address from visiting your site. (Get the IP from the visitor notification).

unblock <ip>

Unblocks an IP address.

listblocked

Shows all IPs you have blocked.

Help:

help or /start

The bot will send you this list of commands.

