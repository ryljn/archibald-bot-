require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const cron = require('node-cron');

// ─── Validate env vars on startup ────────────────────────────────────────────
const REQUIRED_ENV = [
  'DISCORD_BOT_TOKEN',
  'ANTHROPIC_API_KEY',
  'DAILY_TIP_CHANNEL_ID',
  'CHAT_CHANNEL_ID',
];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ─── Clients ─────────────────────────────────────────────────────────────────
const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Privileged intent — must be enabled in Dev Portal
  ],
});

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── System prompts ───────────────────────────────────────────────────────────
const DAILY_TIP_PROMPT =
  "You are Archibald, the AI assistant for Ryljn's mentorship community. " +
  'Post one actionable AI business tip for agency owners and beginners. ' +
  'Keep it under 150 words, casual but valuable, no mainstream news, ' +
  'focus on outreach/automation/client acquisition/productivity. ' +
  'End with — Archibald 🤖. Occasionally mention Ry goes deeper on this inside the community.';

const CHATBOT_PROMPT =
  "You are Archibald, a real person helping out in Ryljn's mentorship community. " +
  "You're not a bot, you're a guide. Talk like a real human — casual, direct, no fluff, minimal emojis. " +
  "Your job is to understand what someone actually needs before giving advice. " +
  "When someone asks a question, respond with 1-2 sentences max that dig deeper into their real problem — ask a better question to find out where they're actually stuck. " +
  "Only give a longer detailed answer once you understand their specific situation. " +
  "Never dump information on someone who hasn't told you enough yet. " +
  "When the conversation naturally leads to mentorship, guide them toward the right tier based on where they are — never pitch, just point them in the right direction. " +
  "Only explain tier details when someone specifically asks about them. " +
  "Tag @ryljn when someone needs real 1:1 help or is clearly ready for Dominion. " +
  "Never go off topic. Stay focused on AI tools, agency growth, outreach, automation, and client acquisition. " +
  "\n\nRyljn's mentorship tiers (only share details when asked):\n" +
  "FOUNDATION — $350 one time. For beginners. Covers: AI tools that actually matter, building your first workflow that pays, outreach basics for finding clients, closing your first client and handling objections.\n" +
  "APEX — $650/month. For people struggling with consistent growth. Covers: backend operations and delegation frameworks, pricing and packaging your services, advanced outreach sequences, client retention and reporting, niching and personal branding.\n" +
  "DOMINION — Custom pricing, 1:1 with Ryljn. For people targeting $30k+ months. Covers: deep dive into your business backend and sales structure, 90-day scaling roadmap, high ticket client acquisition, offer engineering, team building and delegation, systems and automations, scaling to $30k months and beyond.";

// ─── Anthropic helpers ────────────────────────────────────────────────────────
async function generateDailyTip() {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: DAILY_TIP_PROMPT,
    messages: [{ role: 'user', content: "Generate today's daily AI business tip." }],
  });
  return response.content[0].text;
}

async function generateChatReply(username, question) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: CHATBOT_PROMPT,
    messages: [{ role: 'user', content: `${username} asks: ${question}` }],
  });
  return response.content[0].text;
}

// ─── Discord helpers ──────────────────────────────────────────────────────────

// Discord hard-limits messages to 2000 chars — split if needed
async function sendChunked(target, text) {
  const chunks = text.match(/[\s\S]{1,2000}/g) ?? [text];
  for (const chunk of chunks) {
    await target.send(chunk);
  }
}

// ─── Ready: start daily tip cron ─────────────────────────────────────────────
discord.once(Events.ClientReady, (bot) => {
  console.log(`✅ Archibald is online as ${bot.user.tag}`);

  const timezone = process.env.TZ || 'America/New_York';

  // Fires every day at 12:00 pm in the configured timezone
  cron.schedule(
    '0 12 * * *',
    async () => {
      console.log(`[${new Date().toISOString()}] Posting daily tip...`);
      try {
        const channel = await discord.channels.fetch(process.env.DAILY_TIP_CHANNEL_ID);
        if (!channel?.isTextBased()) {
          return console.error('DAILY_TIP_CHANNEL_ID is not a text channel or was not found.');
        }
        const tip = await generateDailyTip();
        await sendChunked(channel, tip);
        console.log('Daily tip posted.');
      } catch (err) {
        console.error('Failed to post daily tip:', err.message);
      }
    },
    { timezone }
  );

  console.log(`📅 Daily tip scheduled for 12:00 PM ${timezone}`);
});

// ─── Message: chatbot ─────────────────────────────────────────────────────────
discord.on(Events.MessageCreate, async (message) => {
  // Ignore bots (including ourselves)
  if (message.author.bot) return;

  // Only react to @mentions of Archibald
  if (!message.mentions.has(discord.user)) return;

  // If already inside a thread, just respond — no need to create another
  const inThread = message.channel.isThread();

  // If in the main chat channel, create a private thread for this user
  if (!inThread && message.channelId === process.env.CHAT_CHANNEL_ID) {
    try {
      const thread = await message.startThread({
        name: `${message.author.username} — Archibald`,
        autoArchiveDuration: 60, // archives after 60 mins of inactivity
        type: 12, // 12 = GUILD_PRIVATE_THREAD
        reason: 'Private Archibald session',
      });

      const question = message.content
        .replace(`<@${discord.user.id}>`, '')
        .replace(`<@!${discord.user.id}>`, '')
        .trim();

      await thread.sendTyping();

      if (!question) {
        await thread.send(`Hey ${message.author.username}, what's going on? What are you working on right now?`);
        return;
      }

      const reply = await generateChatReply(message.author.username, question);
      if (reply.length > 2000) {
        const chunks = reply.match(/[\s\S]{1,2000}/g);
        for (const chunk of chunks) await thread.send(chunk);
      } else {
        await thread.send(reply);
      }
    } catch (err) {
      console.error('Failed to create thread or reply:', err.message);
      await message.reply("Something went wrong on my end. Try again in a second.");
    }
    return;
  }

  // Inside an existing thread — respond normally
  if (inThread) {
    const question = message.content
      .replace(`<@${discord.user.id}>`, '')
      .replace(`<@!${discord.user.id}>`, '')
      .trim();

    if (!question) return;

    try {
      await message.channel.sendTyping();
      const reply = await generateChatReply(message.author.username, question);
      if (reply.length > 2000) {
        const chunks = reply.match(/[\s\S]{1,2000}/g);
        for (const chunk of chunks) await message.channel.send(chunk);
      } else {
        await message.channel.send(reply);
      }
    } catch (err) {
      console.error('Failed to generate chat reply:', err.message);
      await message.channel.send("Something went wrong on my end. Try again in a second.");
    }
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
discord.login(process.env.DISCORD_BOT_TOKEN);
