
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

const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = Number(process.env.PORT || 10000);

const STAFF_ROLE_ID = "1563030053267181630";
const BUYER_ROLE_ID = "1563733088675172522";

const MAIN_ACCESS_ROLE = process.env.MAIN_ACCESS_ROLE || BUYER_ROLE_ID;
const MOBILE_MAIN_ROLE = process.env.MOBILE_MAIN_ROLE || BUYER_ROLE_ID;

const KEY_PREFIX = "JAMARI";
const KEY_LIFETIME = 1000 * 60 * 60 * 24 * 30;

const PURPLE = 0x30213F;
const BLACK = 0x111014;
const RED = 0x7D1828;

const DB_BASE = path.join(__dirname, "data");
const DB_PATH = path.join(DB_BASE, "database.json");

const SCRIPTS = {};
const mobileScriptPath = path.join(__dirname, "scripts", "mobile.lua");

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error("[STARTUP ERROR] BOT_TOKEN and CLIENT_ID are required.");
  process.exit(1);
}

function now() {
  return Date.now();
}

function safeString(value) {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase();
}

function readDB() {
  try {
    fs.mkdirSync(DB_BASE, { recursive: true });

    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2), "utf8");
      return {};
    }

    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch (error) {
    console.error("[DATABASE] Error:", error.message);
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
  const randomPart = (len) => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let output = "";

    for (let i = 0; i < len; i++) {
      output += alphabet[Math.floor(Math.random() * alphabet.length)];
    }

    return output;
  };

  return `${KEY_PREFIX}-${randomPart(4)}-${randomPart(8)}-${randomPart(4)}`;
}

function ensureAccount(db, userId, username) {
  const cleanName = safeString(username) || String(userId);

  if (!db[cleanName]) {
    db[cleanName] = {
      username: cleanName,
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

  db[cleanName].discordId = String(userId);
  return db[cleanName];
}

function createJamariPanelEmbed(userName = "unknown") {
  return new EmbedBuilder()
    .setColor(PURPLE)
    .setAuthor({ name: "THE ADDAMS FAMILY • JAMARI" })
    .setTitle("☠ 𝖂𝖊𝖉𝖓𝖊𝖘𝖉𝖆𝖞'𝖘 𝕾𝖈𝖗𝖎𝖕𝖙 𝕻𝖆𝖓𝖊𝖑")
    .setDescription([
      "*I find social interactions exhausting. This should be easier.*",
      "",
      "╭・ **ACCOUNT ACCESS**",
      "│ Register your account and retrieve your key.",
      "╰・ **SCRIPT ACCESS**",
      "   Choose Main or Mobile Main below.",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "🕷️ **THE RULES OF THE HOUSE**",
      "・ Keep your key somewhere safe.",
      "・ Your key expires after 30 days.",
      "・ Reset your HWID if you change devices.",
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      "*Trust no one. Especially not your key.*"
    ].join("\n"))
    .addFields(
      { name: "🦇 Account", value: "Register • Get Key", inline: true },
      { name: "🕸️ Loaders", value: "Main • Mobile Main", inline: true },
      { name: "⚰️ Security", value: "Reset HWID", inline: true }
    )
    .setFooter({
      text: `JAMARI • Wednesday's approval is not guaranteed • @${userName}`
    })
    .setTimestamp();
}

function createButtonRow() {
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

function createStatusEmbed(title, description, color = PURPLE) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "JAMARI • Wednesday is watching." })
    .setTimestamp();
}

function createLoadHandler(scriptName) {
  return (req, res) => {
    try {
      const db = readDB();
      const { username, key, hwid } = req.body || {};
      const cleanUser = safeString(username);

      if (!cleanUser || !key || !hwid) {
        return res.status(400).json({
          success: false,
          reason: "Username, key, and HWID are required."
        });
      }

      const user = db[cleanUser];

      if (!user) {
        return res.json({ success: false, reason: "Account not found." });
      }

      if (user.status === "disabled") {
        return res.json({
          success: false,
          reason: "Your account has been disabled."
        });
      }

      if (String(user.key) !== String(key)) {
        return res.json({ success: false, reason: "Invalid key." });
      }

      const keyCreatedAt = Number(user.keyCreatedAt);

      if (
        !Number.isFinite(keyCreatedAt) ||
        now() - keyCreatedAt >= KEY_LIFETIME
      ) {
        return res.json({ success: false, reason: "Your key has expired." });
      }

      if (!user.allowedScripts || !user.allowedScripts.includes(scriptName)) {
        return res.json({
          success: false,
          reason: "You do not have access to this script."
        });
      }

      if (!user.hwid) {
        user.hwid = String(hwid).trim();
        user.hwidLockedAt = now();
      } else if (String(user.hwid) !== String(hwid).trim()) {
        return res.json({ success: false, reason: "HWID mismatch." });
      }

      const scriptCode = SCRIPTS[scriptName];

      if (!scriptCode) {
        return res.json({
          success: false,
          reason: "Script content is missing from the server."
        });
      }

      writeDB(db);

      return res.json({
        success: true,
        chunk: scriptCode
      });
    } catch (error) {
      console.error("[API] Loader failure:", error);

      return res.status(500).json({
        success: false,
        reason: "Something went wrong. Please try again."
      });
    }
  };
}

app.get("/", (req, res) => {
  res.send("🕷️ Jamari is running. Wednesday is watching.");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    bot: client.isReady() ? "online" : "connecting",
    scriptsLoaded: Object.keys(SCRIPTS).length
  });
});

app.post("/load/main", createLoadHandler("main"));
app.post("/load/mobile", createLoadHandler("mobile"));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
});

client.on("error", (error) => {
  console.error("[DISCORD CLIENT ERROR]", error);
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === "jamari"
    ) {
      const db = readDB();
      const username =
        safeString(interaction.user.username) || interaction.user.id;

      ensureAccount(db, interaction.user.id, username);
      writeDB(db);

      await interaction.reply({
        embeds: [createJamariPanelEmbed(interaction.user.username)],
        components: [createButtonRow()]
      });

      return;
    }

    if (!interaction.isButton()) return;

    const db = readDB();
    const accountName =
      safeString(interaction.user.username) || String(interaction.user.id);

    const existingAccount = ensureAccount(
      db,
      interaction.user.id,
      accountName
    );

    if (interaction.customId === "jamari_register") {
      existingAccount.status = "active";
      writeDB(db);

      await interaction.reply({
        embeds: [
          createStatusEmbed(
            "🕷️ Registration Complete",
            "Your account has been registered.\n\n*Try not to make a scene.*"
          )
        ],
        ephemeral: true
      });

      return;
    }

    if (interaction.customId === "jamari_get_key") {
      const newKey = generateKey();

      existingAccount.key = newKey;
      existingAccount.keyCreatedAt = now();
      existingAccount.allowedScripts = ["main", "mobile"];

      writeDB(db);

      await interaction.reply({
        embeds: [
          createStatusEmbed(
            "🗝️ Your Jamari Key",
            [
              "Your key has been generated.",
              "",
              `\`\`\`${newKey}\`\`\``,
              "Expires in **30 days**.",
              "",
              "*Do not lose it. I won't comfort you.*"
            ].join("\n")
          )
        ],
        ephemeral: true
      });

      return;
    }

    if (
      interaction.customId === "jamari_main" ||
      interaction.customId === "jamari_mobile_main"
    ) {
      if (!existingAccount.key) {
        await interaction.reply({
          embeds: [
            createStatusEmbed(
              "⚰️ No Key Found",
              "Get a key first. Even Wednesday follows procedures.",
              RED
            )
          ],
          ephemeral: true
        });

        return;
      }

      if (!existingAccount.allowedScripts) {
        existingAccount.allowedScripts = [];
      }

      const scriptName =
        interaction.customId === "jamari_main" ? "main" : "mobile";

      if (!existingAccount.allowedScripts.includes(scriptName)) {
        existingAccount.allowedScripts.push(scriptName);
      }

      writeDB(db);

      await interaction.reply({
        embeds: [
          createStatusEmbed(
            scriptName === "main" ? "☠️ Main Access" : "🦇 Mobile Main Access",
            "Your access is enabled.\n\n*Proceed without enthusiasm.*"
          )
        ],
        ephemeral: true
      });

      return;
    }

    if (interaction.customId === "jamari_reset_hwid") {
      existingAccount.hwid = null;
      existingAccount.hwidLockedAt = null;
      writeDB(db);

      await interaction.reply({
        embeds: [
          createStatusEmbed(
            "⚰️ HWID Reset",
            "Your HWID has been reset.\n\n*You may now bind your account to a new device.*"
          )
        ],
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("[INTERACTION ERROR]", error);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: "🕷️ Something went wrong. Check the bot logs.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

const jamariCommand = new SlashCommandBuilder()
  .setName("jamari")
  .setDescription("Open Wednesday's Jamari script panel");

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  const body = [jamariCommand.toJSON()];

  if (GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body }
    );
    console.log("[DISCORD] Registered guild commands.");
  } else {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body }
    );
    console.log("[DISCORD] Registered global commands.");
  }
}

async function loadScripts() {
  if (fs.existsSync(mobileScriptPath)) {
    SCRIPTS.mobile = fs.readFileSync(mobileScriptPath, "utf8").trim();
    console.log("[SCRIPTS] Loaded scripts/mobile.lua");
  } else {
    SCRIPTS.mobile = 'print("mobile script missing")';
    console.warn("[SCRIPTS] scripts/mobile.lua not found; using fallback script.");
  }

  SCRIPTS.main = "print('main script loaded')";
}

// Open the Render web-service port before Discord startup.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[API] Listening on port ${PORT}`);
});

async function start() {
  await loadScripts();
  await registerCommands();
  await client.login(BOT_TOKEN);
}

start().catch((error) => {
  console.error("[BOOT ERROR]", error);
});

process.on("uncaughtException", (error) => {
  console.error("[CRASH SHIELD] Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[CRASH SHIELD] Unhandled Rejection:", reason);
});
