# Archibald Bot

Discord AI assistant for Ryljn's mentorship community. Posts a daily AI business tip at 12pm and answers questions when @mentioned.

---

## Setup

### Step 1 — Create the Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**.
2. Name it `Archibald`, then go to the **Bot** tab on the left.
3. Click **Add Bot** → confirm.
4. Under **Token**, click **Reset Token**, copy it — this is your `DISCORD_BOT_TOKEN`.
5. Scroll down to **Privileged Gateway Intents** and enable:
   - **Message Content Intent** ✅
   - **Server Members Intent** ✅ (optional but recommended)
6. Save changes.

### Step 2 — Invite the Bot to Your Server

1. Go to **OAuth2 → URL Generator** in the left sidebar.
2. Under **Scopes**, check: `bot`
3. Under **Bot Permissions**, check:
   - `Read Messages / View Channels`
   - `Send Messages`
   - `Read Message History`
4. Copy the generated URL, paste it in your browser, and invite Archibald to your server.

### Step 3 — Get Your Channel IDs

In Discord, go to **User Settings → Advanced** and enable **Developer Mode**.

Then right-click any channel and select **Copy Channel ID**.

You need two IDs:
- The channel where Archibald posts daily tips (`DAILY_TIP_CHANNEL_ID`)
- The channel where Archibald answers @mentions (`CHAT_CHANNEL_ID`)

### Step 4 — Get Your Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Click **API Keys** → **Create Key**
3. Copy the key — this is your `ANTHROPIC_API_KEY`

### Step 5 — Configure Environment Variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
DISCORD_BOT_TOKEN=your_bot_token
ANTHROPIC_API_KEY=your_anthropic_key
DAILY_TIP_CHANNEL_ID=123456789012345678
CHAT_CHANNEL_ID=123456789012345679
TZ=America/New_York
```

**Timezone options:** Use any timezone from the [tz database](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (e.g. `America/Los_Angeles`, `Europe/London`, `UTC`).

### Step 6 — Install & Run

```bash
cd archibald-bot
npm install
npm start
```

You should see:
```
✅ Archibald is online as Archibald#1234
📅 Daily tip scheduled for 12:00 PM America/New_York
```

---

## How It Works

### Function 1 — Daily Tip
Every day at **12:00 PM** (your configured timezone), Archibald calls the Anthropic API and posts a fresh AI business tip to `DAILY_TIP_CHANNEL_ID`.

### Function 2 — Chatbot
Archibald watches `CHAT_CHANNEL_ID` for @mentions. When someone tags him with a question, he replies using Claude. He only responds when directly @mentioned and only in the designated channel.

---

## Hosting (Keep It Running 24/7)

**Option A — Railway (easiest)**
1. Push the folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add your env vars under **Variables**
4. Deploy — done

**Option B — Fly.io**
```bash
npm install -g flyctl
fly launch
fly secrets set DISCORD_BOT_TOKEN=... ANTHROPIC_API_KEY=... DAILY_TIP_CHANNEL_ID=... CHAT_CHANNEL_ID=...
fly deploy
```

**Option C — VPS / local server (pm2)**
```bash
npm install -g pm2
pm2 start index.js --name archibald
pm2 save
pm2 startup  # auto-restart on reboot
```

---

## Files

```
archibald-bot/
├── index.js          # Bot logic (daily tip + chatbot)
├── package.json      # Dependencies
├── .env.example      # Environment variable template
└── README.md         # This file
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot token from Discord Developer Portal |
| `ANTHROPIC_API_KEY` | API key from console.anthropic.com |
| `DAILY_TIP_CHANNEL_ID` | Channel ID for daily tip posts |
| `CHAT_CHANNEL_ID` | Channel ID where @mentions are answered |
| `TZ` | Timezone for 12pm schedule (default: `America/New_York`) |
