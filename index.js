const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const express = require("express");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || null;
const PORT = Number(process.env.PORT || 10000);

const KEY_PREFIX = "JAMARI";
const KEY_LIFETIME = 30 * 24 * 60 * 60 * 1000;
const PURPLE = 0x30213F;
const RED = 0x7D1828;

const DB_BASE = path.join(__dirname, "data");
const DB_PATH = path.join(DB_BASE, "database.json");
const MOBILE_SCRIPT_PATH = path.join(__dirname, "scripts", "mobile.lua");
const MAIN_SCRIPT_PATH = path.join(__dirname, "scripts", "main.lua");
const SCRIPTS = {};

console.log("[ENV DEBUG]", {
  hasBotToken: Boolean(BOT_TOKEN),
  hasClientId: Boolean(CLIENT_ID),
  hasGuildId: Boolean(GUILD_ID),
  port: PORT,
  guildId: GUILD_ID,
  botTokenLength: BOT_TOKEN ? BOT_TOKEN.length : 0,
  clientIdLength: CLIENT_ID ? CLIENT_ID.length : 0
});

if (!BOT_TOKEN) {
  console.error("[STARTUP ERROR] BOT_TOKEN or DISCORD_TOKEN is required.");
  process.exit(1);
}

function now() {
  return Date.now();
}

function safeString(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function readDB() {
  try {
    fs.mkdirSync(DB_BASE, { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, "{}", "utf8");
    }
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (error) {
    console.error("[DATABASE ERROR]", error.message);
    return {};
  }
}

function writeDB(db) {
  try {
    fs.mkdirSync(DB_BASE, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (error) {
    console.error("[DATABASE WRITE ERROR]", error.message);
  }
}

function generateKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (length) =>
    Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

  return `${KEY_PREFIX}-${part(4)}-${part(8)}-${part(4)}`;
}

function ensureAccount(db, userId, username) {
  const name = safeString(username) || String(userId);

  if (!db[name]) {
    db[name] = {
      username: name,
      discordId: String(userId),
      key: null,
      keyCreatedAt: null,
      hwid: null,
      hwidLockedAt: null,
      allowedScripts: [],
      status: "active",
      createdAt: now()
    };
  }

  db[name].discordId = String(userId);
  return db[name];
}

function panelEmbed(username = "unknown") {
  return new EmbedBuilder()
    .setColor(PURPLE)
    .setAuthor({ name: "THE ADDAMS FAMILY • JAMARI" })
    .setTitle("☠ 𝖂𝖊𝖉𝖓𝖊𝖘𝖉𝖆𝖞'𝖘 𝕾𝖈𝖗𝖎𝖕𝖙 𝕻𝖆𝖓𝖊𝖑")
    .setDescription([
      "*I find social interactions exhausting. This should be easier.*",
      "",
      "╭・ **ACCOUNT ACCESS**",
      "│ Register and retrieve your key.",
      "╰・ **SCRIPT ACCESS**",
      "   Choose Main or Mobile Main.",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "🕷️ **THE RULES OF THE HOUSE**",
      "・ Keep your key safe.",
      "・ Keys expire after 30 days.",
      "・ Reset your HWID when changing devices.",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "*Trust no one. Especially not your key.*"
    ].join("\n"))
    .addFields(
      { name: "🦇 Account", value: "Register • Get Key", inline: true },
      { name: "🕸️ Loaders", value: "Main • Mobile Main", inline: true },
      { name: "⚰️ Security", value: "Reset HWID", inline: true }
    )
    .setFooter({ text: `JAMARI • Wednesday is watching • @${username}` })
    .setTimestamp();
}

function statusEmbed(title, description, color = PURPLE) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "JAMARI • Wednesday is watching." })
    .setTimestamp();
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("jamari_register")
      .setLabel("Register")
      .setEmoji("🕷️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("jamari_get_key")
      .setLabel("Get Key")
      .setEmoji("🗝️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("jamari_main")
      .setLabel("Main")
      .setEmoji("☠️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("jamari_mobile_main")
      .setLabel("Mobile Main")
      .setEmoji("🦇")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("jamari_reset_hwid")
      .setLabel("Reset HWID")
      .setEmoji("⚰️")
      .setStyle(ButtonStyle.Danger)
  );
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

app.get("/", (req, res) => {
  res.send("🕷️ Jamari is running. Wednesday is watching.");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    bot: client.isReady() ? "online" : "offline",
    scriptsLoaded: Object.keys(SCRIPTS).length,
    uptime: process.uptime()
  });
});

app.post("/load/main", createLoadHandler("main"));
app.post("/load/mobile", createLoadHandler("mobile"));

function createLoadHandler(scriptName) {
  return (req, res) => {
    try {
      const db = readDB();
      const { username, key, hwid } = req.body || {};
      const name = safeString(username);

      if (!name || !key || !hwid) {
        return res.status(400).json({
          success: false,
          reason: "Username, key, and HWID are required."
        });
      }

      const account = db[name];

      if (!account || account.status === "disabled") {
        return res.json({
          success: false,
          reason: "Account not found or disabled."
        });
      }

      if (String(account.key) !== String(key)) {
        return res.json({ success: false, reason: "Invalid key." });
      }

      if (
        !Number.isFinite(Number(account.keyCreatedAt)) ||
        now() - Number(account.keyCreatedAt) >= KEY_LIFETIME
      ) {
        return res.json({ success: false, reason: "Your key has expired." });
      }

      if (!account.allowedScripts?.includes(scriptName)) {
        return res.json({
          success: false,
          reason: "You do not have access to this script."
        });
      }

      const requestedHwid = String(hwid).trim();

      if (!account.hwid) {
        account.hwid = requestedHwid;
        account.hwidLockedAt = now();
      } else if (account.hwid !== requestedHwid) {
        return res.json({ success: false, reason: "HWID mismatch." });
      }

      const chunk = SCRIPTS[scriptName];

      if (!chunk || !chunk.trim()) {
        return res.json({
          success: false,
          reason: "Script content is missing or unavailable."
        });
      }

      writeDB(db);
      return res.json({ success: true, chunk });
    } catch (error) {
      console.error("[API LOADER ERROR]", error);
      return res.status(500).json({
        success: false,
        reason: "Internal server error."
      });
    }
  };
}

client.once("ready", () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  registerCommands().catch((error) => {
    console.error("[DISCORD COMMAND REGISTRATION ERROR]", error);
  });
});

client.on("error", (error) => {
  console.error("[DISCORD CLIENT ERROR]", error);
});

client.on("shardError", (error) => {
  console.error("[DISCORD SHARD ERROR]", error);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "jamari"
    ) {
      const db = readDB();
      ensureAccount(db, interaction.user.id, interaction.user.username);
      writeDB(db);

      await interaction.reply({
        embeds: [panelEmbed(interaction.user.username)],
        components: [panelButtons()]
      });
      return;
    }

    if (!interaction.isButton()) return;

    const db = readDB();
    const account = ensureAccount(
      db,
      interaction.user.id,
      interaction.user.username
    );

    switch (interaction.customId) {
      case "jamari_register":
        account.status = "active";
        writeDB(db);
        await interaction.reply({
          embeds: [
            statusEmbed(
              "🕷️ Registration Complete",
              "Your account has been registered.\n\n*Try not to make a scene.*"
            )
          ],
          ephemeral: true
        });
        break;

      case "jamari_get_key": {
        const key = generateKey();
        account.key = key;
        account.keyCreatedAt = now();
        account.allowedScripts = ["main", "mobile"];
        writeDB(db);

        await interaction.reply({
          embeds: [
            statusEmbed(
              "🗝️ Your Jamari Key",
              `Your key has been generated.\n\n\`\`\`${key}\`\`\`\nExpires in **30 days**.`
            )
          ],
          ephemeral: true
        });
        break;
      }

      case "jamari_main":
      case "jamari_mobile_main": {
        if (!account.key) {
          await interaction.reply({
            embeds: [
              statusEmbed(
                "⚰️ No Key Found",
                "Get a key first.",
                RED
              )
            ],
            ephemeral: true
          });
          break;
        }

        const scriptName =
          interaction.customId === "jamari_main" ? "main" : "mobile";

        account.allowedScripts ||= [];
        if (!account.allowedScripts.includes(scriptName)) {
          account.allowedScripts.push(scriptName);
        }

        writeDB(db);

        await interaction.reply({
          embeds: [
            statusEmbed(
              scriptName === "main" ? "☠️ Main Access" : "🦇 Mobile Main Access",
              "Your access is enabled."
            )
          ],
          ephemeral: true
        });
        break;
      }

      case "jamari_reset_hwid":
        account.hwid = null;
        account.hwidLockedAt = null;
        writeDB(db);

        await interaction.reply({
          embeds: [
            statusEmbed(
              "⚰️ HWID Reset",
              "Your HWID has been reset."
            )
          ],
          ephemeral: true
        });
        break;
    }
  } catch (error) {
    console.error("[INTERACTION ERROR]", error);

    if (interaction.isRepliable() && !interaction.replied) {
      await interaction
        .reply({
          content: "Something went wrong. Check the Render logs.",
          ephemeral: true
        })
        .catch(() => {});
    }
  }
});

const jamariCommand = new SlashCommandBuilder()
  .setName("jamari")
  .setDescription("Open Wednesday's Jamari script panel");

async function registerCommands() {
  if (!CLIENT_ID) {
    console.warn("[DISCORD] CLIENT_ID not set. Skipping slash command registration.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

  if (GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: [jamariCommand.toJSON()] }
    );
    console.log("[DISCORD] Guild slash command registered.");
  } else {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [jamariCommand.toJSON()] }
    );
    console.log("[DISCORD] Global slash command registered.");
  }
}

async function loadScripts() {
  const scriptsDir = path.join(__dirname, "scripts");

  try {
    fs.mkdirSync(scriptsDir, { recursive: true });
  } catch (error) {
    console.error("[SCRIPTS] Failed to ensure scripts directory exists.", error);
  }

  if (fs.existsSync(MOBILE_SCRIPT_PATH)) {
    SCRIPTS.mobile = fs.readFileSync(MOBILE_SCRIPT_PATH, "utf8").trim();
    console.log("[SCRIPTS] Loaded scripts/mobile.lua");
  } else {
    SCRIPTS.mobile = "";
    console.warn("[SCRIPTS] scripts/mobile.lua is missing.");
  }

  if (fs.existsSync(MAIN_SCRIPT_PATH)) {
    SCRIPTS.main = fs.readFileSync(MAIN_SCRIPT_PATH, "utf8").trim();
    console.log("[SCRIPTS] Loaded scripts/main.lua");
  } else {
    SCRIPTS.main = "";
    console.warn("[SCRIPTS] scripts/main.lua is missing.");
  }
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[API] Listening on port ${PORT}`);
});

async function start() {
  await loadScripts();

  if (!BOT_TOKEN) {
    console.error("[STARTUP ERROR] Missing BOT_TOKEN / DISCORD_TOKEN in environment.");
    process.exit(1);
  }

  if (!CLIENT_ID) {
    console.warn("[DISCORD] CLIENT_ID not set. Slash commands will not register.");
  }

  console.log("[BOT] Attempting Discord login...");

  try {
    await client.login(BOT_TOKEN);
    console.log("[BOT] Login successful.");
  } catch (error) {
    console.error("[DISCORD LOGIN ERROR]", error);
    process.exit(1);
  }
}
start().catch((error) => {
  console.error("[BOOT ERROR]", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
});
