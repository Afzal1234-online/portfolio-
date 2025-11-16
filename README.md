3D Artist Portfolio - Telegram CMS
This is a complete, production-ready portfolio website for a 3D artist, where all content—media, profile info, and contact details—is managed entirely from a private Telegram bot.
It's a full-stack application with a Node.js backend (server.js) and a dynamic HTML/CSS/JS frontend (public/index.html).
Features
Telegram-Powered CMS: Update your site by just sending messages to your bot.
Dynamic Media Galleries: Upload photos and videos; the site automatically categorizes them based on your caption (anamorphic, event, stall).
Dynamic Profile: Update your profile picture, name, title, and description from Telegram.
Dynamic Contact Info: Update your phone, email, and Telegram links instantly.
Real-Time Updates: Uses Server-Sent Events (SSE) to push updates to all visitors live. No page refresh needed.
Persistent Database: Uses SQLite to store all media and config, so nothing is lost on restart.
Secure Admin: All commands are locked to your specific, private ADMIN_CHAT_ID.
Premium Frontend: A client-ready, responsive, dark-mode website with a lightbox viewer.
1. Local Setup & Installation
Prerequisites
Node.js (v18 or later)
A Telegram Bot Token
Your Admin Chat ID
How to get your Telegram Bot Token
Open Telegram and search for the @BotFather.
Start a chat and send /newbot.
Follow the instructions to name your bot (e.g., "Afzal Portfolio Bot").
BotFather will give you a Token. It looks like 123456:ABC-DEF.... Copy this.
How to get your Admin Chat ID
Search for your new bot in Telegram and send it a message (e.g., /start).
Search for the @userinfobot in Telegram.
Start a chat and it will immediately reply with your info.
Copy your Id (e.g., 7076125469). This is your ADMIN_CHAT_ID.
Installation Steps
Download: Get the package.json and server.js files. Create a new folder for your project (e.g., afzal-portfolio) and place them inside.
Create public folder: Inside your project folder, create a new folder named public.
Add Frontend: Place the index.html file inside the public folder.
Install Dependencies: Open a terminal in your project folder and run:
npm install


Create .env file: Create a file named .env in the root of your project. This file is critical for storing your secret keys.
Edit .env file: Add your keys to the .env file. You must set HOST_URL for the webhook to work.
# --- .env file ---

# 1. Your Bot Token from @BotFather
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# 2. Your personal Chat ID from @userinfobot
ADMIN_CHAT_ID=7076125469

# 3. The public URL of your server.
# For local testing, use a tool like ngrok (see below).
# For deployment, this will be your Render/Vercel/Heroku URL.
# e.g., [https://your-app-name.onrender.com](https://your-app-name.onrender.com)
HOST_URL=[https://your-app-name.onrender.com](https://your-app-name.onrender.com)


2. Running the Server
For Production (Deployment)
You will deploy this project to a hosting service. When you do, you will set the environment variables in the service's dashboard (not in a .env file).
Run the start command (most services do this automatically):
npm start


For Local Development (with ngrok)
The Telegram Webhook must have a public HTTPS URL. You can't use localhost. A tool called ngrok creates a secure public URL that tunnels to your local machine.
Download ngrok and set it up.
In a new terminal, start ngrok to expose your local port 3000:
ngrok http 3000


ngrok will give you a "Forwarding" URL, like https://random-string.ngrok-free.app.
Copy this HTTPS URL.
Paste this URL into your .env file for the HOST_URL variable.
HOST_URL=[https://random-string.ngrok-free.app](https://random-string.ngrok-free.app)


Now, in your project terminal, start the server in "dev" mode (which auto-restarts):
npm run dev


Your server is now running locally, and Telegram can send updates to your ngrok URL. Open http://localhost:3000 in your browser to see the site.
3. How to Use (Telegram Commands)
All commands are sent as messages to your bot from your admin account.
Uploading Media
To upload a Photo/Video: Just send the file to the bot.
To categorize: Add a caption when you upload.
anamorphic project-x - Puts in "Anamorphic" gallery, sets Project Name to "Project-x".
event client-y walkthrough - Puts in "Event Walkthroughs" gallery.
stall design - Puts in "Stall Walkthroughs" gallery.
my new logo - No keywords, so it goes to "General".
To set Profile Photo: Send a photo with the exact caption:
profile photo
Managing Content
Set Name: set name Mohammed Afzal
Set Title: set title 3D Generalist
Set Description: set desc New description text here...
Set Phone: set phone +91 9876543210
Set Email: set email new-email@example.com
Set Telegram Link: set telegram https://t.me/your_username
Managing Media
List Media: list
The bot will reply with the 10 most recent media items and their Unique IDs.
Delete Media: delete <file_unique_id>
Copy the file_unique_id from the list command.
Example: delete BQADAgADDAADy...
Help
Get Help: help or /start
The bot will send you this list of commands.
4. Deployment
This project is ready to be deployed to any service that supports Node.js. Render is highly recommended.
Deploying to Render (Recommended)
Push your project (including package.json, server.js, and the public folder) to a GitHub repository. DO NOT push your .env file.
Sign up for Render.
Create a new "Web Service".
Connect your GitHub repository.
Set the Root Directory (if needed, but should be blank).
Set the Build Command: npm install
Set the Start Command: npm start
Go to the "Environment" tab and add your three environment variables:
TELEGRAM_BOT_TOKEN
ADMIN_CHAT_ID
HOST_URL (This will be your new Render URL, e.g., https://your-app.onrender.com)
Click "Create Web Service". Render will build and deploy your app.
The first time it starts, server.js will automatically set the Telegram webhook to your new Render URL.
Your site is live! You can now manage it from Telegram.
