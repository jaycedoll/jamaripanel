
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const express = require("express");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
  MAIN_LOADER_URL,
  MOBILE_LOADER_URL
} = process.env;

const PURPLE = 0x302536;
const BLACK = 0x100D10;
const RED = 0x761C2B;

// HEALTH SERVER
app.get("/", (_req, res) => {
  res.status(200).send("🎃 vivians is running 🦇");
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    bot: "Jamari",
    discord: client.isReady()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[WEB] Listening on port ${PORT}`);
});

// KEEP ALIVE
const KEEP_ALIVE_INTERVAL = 5 * 60 * 1000;

function startKeepAlive() {
  const urlStr =
    process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

  const healthUrl = `${urlStr.replace(/\/+$/, "")}/health`;
  const mod = healthUrl.startsWith("https") ? https : http;

  setInterval(() => {
    const req = mod.get(healthUrl, { timeout: 5000 }, res => {
      let data = "";

      res.on("data", chunk => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const json = JSON.parse(data);

          if (res.statusCode === 200 && json.status === "ok") {
            console.log(
              "[KEEP-ALIVE] Ping successful — " +
              new Date().toLocaleTimeString()
            );
          }
        } catch {
          console.log("[KEEP-ALIVE] Invalid health response.");
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("keep-alive timeout"));
    });

    req.on("error", err => {
      console.log("[KEEP-ALIVE] Ping failed: " + err.message);
    });
  }, KEEP_ALIVE_INTERVAL);
}

startKeepAlive();

// JAMARI KEY GENERATOR
function generateKey() {
  const a = Math.random().toString(36).substring(2, 6).toUpperCase();
  const b = Math.random().toString(36).substring(2, 10).toUpperCase();
  const c = Math.random().toString(36).substring(2, 4).toUpperCase();

  return "JAMARI-" + a + "-" + b + "-" + c;
}

function formatDate(ms) {
  const d = new Date(ms);
  const months = [
    "January", "February", "March", "April",
    "May", "June", "July", "August",
    "September", "October", "November", "December"
  ];

  return months[d.getMonth()] + " " +
    d.getDate() + ", " + d.getFullYear();
}

// WEDNESDAY PANEL
function createPanel() {
  const embed = new EmbedBuilder()
    .setColor(PURPLE)
    .setTitle("☾ 𝖂𝖊𝖉𝖓𝖊𝖘𝖉𝖆𝖞'𝖘 𝕻𝖆𝖓𝖊𝖑 ☽")
    .setDescription([
      "╭───────────────╮",
      "*Welcome to my little nightmare.*",
      "Choose wisely. I dislike mistakes.",
      "╰───────────────╯",
      "",
      "**☠ HOW TO USE**",
      "› Register your username",
      "› Generate your key",
      "› Choose Main or Mobile",
      "› Follow the instructions",
      "",
      "† ───────────────── †",
      "",
      "**♡ AVAILABLE ACTIONS**",
      "Register · Get Key · Main · Mobile · Reset HWID",
      "",
      "*I find people exhausting. Buttons are acceptable.*"
    ].join("\n"))
    .setFooter({
      text: "Jamari • I like skulls "
    })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("register")
      .setLabel("Register")
      .setEmoji("🕸️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("getkey")
      .setLabel("Get Key")
      .setEmoji("☠️")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("main")
      .setLabel("Main")
      .setEmoji("☠️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("mobile")
      .setLabel("Mobile")
      .setEmoji("🖤")
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("resethwid")
      .setLabel("Reset HWID")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, components: [row1, row2] };
}

// SLASH COMMANDS
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("panel")
      .setDescription("Post Jamari's Wednesday-themed panel"),

    new SlashCommandBuilder()
      .setName("announce")
      .setDescription("Send an announcement")
      .addStringOption(option =>
        option
          .setName("message")
          .setDescription("Announcement text")
          .setRequired(true)
      )
  ].map(command => command.toJSON());

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  if (GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
  } else {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
  }

  console.log("[DISCORD] Slash commands registered.");
}

client.once("ready", () => {
  console.log(`[DISCORD] Logged in as ${client.user.tag}`);
});

// INTERACTIONS
client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "panel") {
        const { embed, components } = createPanel();

        await interaction.reply({
          embeds: [embed],
          components,
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === "announce") {
        if (!interaction.memberPermissions?.has("Administrator")) {
          await interaction.reply({
            content: "☠ Only administrators may make announcements.",
            ephemeral: true
          });
          return;
        }

        const message = interaction.options.getString("message", true);

        const embed = new EmbedBuilder()
          .setColor(RED)
          .setTitle("† A MESSAGE FROM THE DARK †")
          .setDescription(message)
          .setFooter({ text: "Jamari has spoken." })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
      }
    }

    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "register") {
        const modal = new ModalBuilder()
          .setCustomId("register_modal")
          .setTitle("☠ Enter the darkness");

        const username = new TextInputBuilder()
          .setCustomId("username")
          .setLabel("Roblox username")
          .setPlaceholder("Enter your username")
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(20)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(username)
        );

        await interaction.showModal(modal);
        return;
      }

      if (id === "getkey") {
        const key = generateKey();

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(PURPLE)
              .setTitle("🗝️ Your Jamari Key")
              .setDescription(
                `\`\`\`${key}\`\`\`\n` +
                `Generated: ${formatDate(Date.now())}\n\n` +
                "Demo key only. Keys are not saved or validated."
              )
          ],
          ephemeral: true
        });
        return;
      }

      if (id === "main" || id === "mobile") {
        const url = id === "main"
          ? MAIN_LOADER_URL
          : MOBILE_LOADER_URL;

        if (!url) {
          await interaction.reply({
            content: `☠ The ${id} loader URL has not been configured.`,
            ephemeral: true
          });
          return;
        }

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(BLACK)
              .setTitle(id === "main" ? "☠ Main Loader" : "🖤 Mobile Loader")
              .setDescription(`[Open your loader](${url})`)
              .setFooter({ text: "Use only trusted links." })
          ],
          ephemeral: true
        });
        return;
      }

      if (id === "resethwid") {
        await interaction.reply({
          content:
            " HWID reset.",
          ephemeral: true
        });
        return;
      }
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId === "register_modal"
    ) {
      const username =
        interaction.fields.getTextInputValue("username");

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(PURPLE)
            .setTitle("🕸️ Registration received")
            .setDescription(
              `Username: **${username}**\n\n` +
              "This is a demonstration. Account storage is not configured."
            )
        ],
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("[INTERACTION] Error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong. Check the Render logs.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// START BOT
async function start() {
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    throw new Error(
      "Missing DISCORD_TOKEN or CLIENT_ID in Render environment variables."
    );
  }

  await client.login(DISCORD_TOKEN);
  await registerCommands();
}

start().catch(error => {
  console.error("[STARTUP] Error:", error);
  process.exit(1);
});
