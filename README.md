# 🎱 Bingo Clash - Multiplayer & AI (Render + GitHub + APK)

A modern, visually stunning **5x5 BINGO duel game** built with real-time multiplayer support for **Render.com**, repository setup for **GitHub**, smart **Computer AI** for offline single-player, and ready for **Android APK** generation!

---

## 🌟 Key Features

1. **🤖 Play vs Computer (Offline Single-Player)**:
   - Play anytime without an internet connection or second player.
   - Intelligent AI bot analyzes board synergy and actively competes to form lines.
   - Choose to shuffle your board or place numbers strategically.

2. **👥 Real-time Multiplayer (Play with Friends)**:
   - Private 1v1 Rooms with 5-letter Room Codes.
   - 1-Click invite link generator (e.g., `https://your-app.onrender.com/?room=K8XP2`).
   - Real-time number calling synced over WebSockets via Socket.io.
   - Live turn indicators, B-I-N-G-O letter unlock badges, line counters, and emoji reactions (🎉 😂 🔥 🎯 😱 🏆).
   - Rematch button at the end of each game.

3. **🎨 Amazing Neon & Glassmorphism Design**:
   - 3 dynamic themes: **Cyberpunk Neon**, **Sunset Aurora**, and **Emerald Cyber**.
   - Procedural Web Audio API sound effects (pops, strikes, chimes, victory fanfare) with zero external asset lag.
   - Confetti particle explosion on winning.
   - Fully responsive for Android, iOS, tablets, and desktop.

4. **📱 Android APK & PWA Ready**:
   - Web App Manifest (`manifest.json`) and high-res launcher icons included.
   - Offline caching via Service Worker (`sw.js`).
   - 1-minute 1-click APK download via PWABuilder or Capacitor.

---

## 🚀 Quick Start (Play Offline Instantly)

You don't even need to wait for deployment to play!
Simply double-click:
```
public/index.html
```
in your browser (Chrome, Edge, Firefox, Brave) and start playing against the Computer immediately!

---

## 🐙 Step 1: Upload to GitHub

1. Open your terminal in the project folder:
   ```bash
   cd "C:\Users\admin\.gemini\antigravity\scratch\bingo-game"
   ```
2. Initialize Git and commit your files:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Bingo Clash with AI, Multiplayer, Render & APK"
   ```
3. Go to [github.com/new](https://github.com/new) and create a new repository called `bingo-clash`.
4. Link and push your repository:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/bingo-clash.git
   git push -u origin main
   ```

---

## ☁️ Step 2: Deploy Free on Render.com

Render supports Node.js web services and WebSockets natively on its Free Tier!

1. Go to [Render.com](https://render.com) and log in (you can log in directly with your GitHub account).
2. Click **New +** in the top right corner and select **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your `bingo-clash` repository.
4. Fill in the deployment settings:
   - **Name**: `bingo-clash` (or any unique name you like)
   - **Language**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Click **Create Web Service**.
6. Render will build and deploy your app in about 1-2 minutes!
   You will get a live public URL such as:
   `https://bingo-clash.onrender.com`

---

## 🎮 Step 3: Playing with your Friend Online

1. Open your Render URL (`https://your-bingo-app.onrender.com`).
2. Click **Game Mode 🎮** and choose **Play Online with Friend**.
3. Click **➕ Create New Private Room**.
4. Click **🔗 Copy Invite Link** and send it to your friend on WhatsApp, Discord, or SMS!
5. When your friend opens the link, they automatically connect to your room.
6. Both of you click **🎲 Shuffle Board** and **Ready to Play!**.
7. Take turns clicking numbers on your board to complete 5 lines and shout **BINGO!**

---

## 📲 Step 4: Getting the Android APK

There are two super easy ways to get this onto an Android phone:

### Method A: 1-Click Free APK using PWABuilder (Recommended)
1. Deploy your game to Render so you have a live HTTPS URL (e.g., `https://bingo-clash.onrender.com`).
2. Visit [PWABuilder.com](https://www.pwabuilder.com).
3. Paste your Render URL and click **Start**.
4. PWABuilder will analyze your PWA (manifest and service worker are already pre-configured!).
5. Click **Package for Android** -> **Generate APK / AAB**.
6. Download the generated `.apk` file and install it directly on your Android phone!

### Method B: Direct Android Installation (No APK compilation needed)
1. Open your live Render URL on your Android phone in Google Chrome.
2. Tap the **"📲 Get App"** button inside the game navbar (or Chrome's **3 vertical dots ⋮** in the top right).
3. Select **"Install app"** or **"Add to Home screen"**.
4. The Bingo game installs as an independent, full-screen native-like Android app on your phone with the app icon!

---

## 📁 Project Structure

```
bingo-game/
├── public/
│   ├── index.html       # Main responsive HTML layout & UI
│   ├── style.css        # Neon cyberpunk theme & glassmorphism
│   ├── game.js          # Core game engine, confetti, lines, sockets
│   ├── ai.js            # Strategic Computer Bot logic for offline play
│   ├── audio.js         # Web Audio API sound synthesizer
│   ├── manifest.json    # Android PWA Web App Manifest
│   ├── sw.js            # Service Worker for offline caching
│   └── icons/
│       ├── icon-192.png # Android app launcher icon (192x192)
│       └── icon-512.png # Android app splash icon (512x512)
├── server.js            # Express & Socket.io multiplayer backend
├── render.yaml          # Render.com automatic blueprint deploy configuration
├── capacitor.config.json# Android Studio / Capacitor APK configuration
├── package.json         # Dependencies & start scripts
└── README.md            # Complete guide
```
