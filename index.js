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
  "You are Archibald, AI assistant for Ryljn's mentorship community. " +
  'Be helpful, casual, smart, and witty. Answer questions about AI tools, ' +
  'agency growth, outreach, automation, and client acquisition. ' +
  "Always tie answers back to Ryljn's mentorship tiers — " +
  'Foundation ($97 one time), Apex ($350/month), Dominion (call required). ' +
  'Tag @ryljn when they need real personalized help. Never go off topic.';

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

  // Only respond in the designated chat channel
  if (message.channelId !== process.env.CHAT_CHANNEL_ID) return;

  // Strip the @mention to get the actual question
  const question = message.content
    .replace(`<@${discord.user.id}>`, '')
    .replace(`<@!${discord.user.id}>`, '')
    .trim();

  if (!question) {
    await message.reply(
      "Hey! What's on your mind? Ask me anything about AI, agency growth, or automation 🤖"
    );
    return;
  }

  try {
    await message.channel.sendTyping();
    const reply = await generateChatReply(message.author.username, question);

    // Reply so the user gets pinged
    if (reply.length > 2000) {
      // First chunk as a reply, rest as follow-up messages
      const chunks = reply.match(/[\s\S]{1,2000}/g);
      await message.reply(chunks[0]);
      for (const chunk of chunks.slice(1)) {
        await message.channel.send(chunk);
      }
    } else {
      await message.reply(reply);
    }
  } catch (err) {
    console.error('Failed to generate chat reply:', err.message);
    await message.reply(
      "Hmm, something glitched on my end. Give it another shot in a sec! 🤖"
    );
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
discord.login(process.env.DISCORD_BOT_TOKEN);
