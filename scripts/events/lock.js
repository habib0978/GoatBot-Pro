const fs = require("fs");
const path = require("path");
const axios = require("axios");

const cacheDir = path.join(__dirname, "cache");
const protectPath = path.join(cacheDir, "Islamic_bot.json");
const OWNER_ID = "61567875354215";

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

let protectData = {};

function loadProtectData() {
  try {
    if (!fs.existsSync(protectPath)) {
      protectData = {};
      return;
    }

    const raw = fs.readFileSync(protectPath, "utf8").trim();
    protectData = raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("❌ Failed to load protection data:", error);
    protectData = {};
  }
}

function saveProtectData() {
  try {
    fs.writeFileSync(
      protectPath,
      JSON.stringify(protectData, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("❌ Failed to save protection data:", error);
  }
}

function getState(threadID) {
  return protectData[threadID] || null;
}

function isLocked(threadID) {
  return Boolean(getState(threadID)?.protect);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAdmin(threadInfo, userID) {
  return Boolean(
    threadInfo?.adminIDs?.some(admin => String(admin.id) === String(userID))
  );
}

function getGroupImagePath(threadID) {
  return path.join(cacheDir, `protect_${threadID}.png`);
}

function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_) {}
}

async function downloadImage(url, filePath) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000
  });

  fs.writeFileSync(filePath, Buffer.from(response.data));
  return filePath;
}

async function sendOwnerNotice(api, message) {
  try {
    await api.sendMessage(message, OWNER_ID);
  } catch (error) {
    console.error("❌ Owner inbox notice failed:", error.message);
  }
}

function formatStatus(threadID) {
  const data = getState(threadID);

  if (!data) {
    return "🔓 No protection is configured for this group.";
  }

  return (
    "🛡️ GROUP LOCK STATUS\n\n" +
    `🔒 Protection: ${data.protect ? "ON" : "OFF"}\n` +
    `📝 Name: ${data.lockName ? "LOCKED" : "UNLOCKED"}\n` +
    `😀 Emoji: ${data.lockEmoji ? "LOCKED" : "UNLOCKED"}\n` +
    `🖼️ Image: ${data.lockImage ? "LOCKED" : "UNLOCKED"}\n` +
    `⏱️ Updated: ${data.updatedAt || "Unknown"}`
  );
}

async function restoreProtection(api, threadID, reason = "Automatic Check") {
  const saved = getState(threadID);

  if (!saved || !saved.protect) return;

  try {
    const current = await api.getThreadInfo(threadID);
    const changed = [];

    if (saved.lockName && saved.name !== undefined &&
        current.threadName !== saved.name) {
      try {
        await api.setTitle(saved.name, threadID);
        changed.push("Group Name");
      } catch (error) {
        console.error("❌ Name restore failed:", error.message);
      }
    }

    if (saved.lockEmoji && saved.emoji !== undefined &&
        current.emoji !== saved.emoji) {
      try {
        await api.changeThreadEmoji(saved.emoji, threadID);
        changed.push("Group Emoji");
      } catch (error) {
        console.error("❌ Emoji restore failed:", error.message);
      }
    }

    if (changed.length > 0) {
      await sendOwnerNotice(
        api,
        "🚨 GROUP LOCK ALERT!\n\n" +
        `👥 Group: ${current.threadName || "Unknown"}\n` +
        `🆔 Group ID: ${threadID}\n` +
        `⚠️ Changed: ${changed.join(", ")}\n` +
        "🔄 Status: RESTORED\n" +
        `📌 Reason: ${reason}\n` +
        "🔒 Protection: ACTIVE"
      );
    }
  } catch (error) {
    console.error("❌ Protection check failed:", error.message);
  }
}

module.exports.config = {
  name: "lock",
  version: "3.0.0",
  hasPermssion: 0,
  credits: "🔰 RAHAT ISLAM - Upgraded",
  description: "Advanced persistent group name, emoji and image protection",
  commandCategory: "Box",
  usages:
    "!lock on | !lock off | !lock status | !lock name <name> | !lock emoji <emoji> | reply photo + !lock image",
  cooldowns: 3,
  dependencies: {}
};

module.exports.run = async ({ api, event, args }) => {
  const threadID = event.threadID;
  const subCommand = (args[0] || "").toLowerCase();

  if (!subCommand) {
    return api.sendMessage(
      "🛡️ LOCK COMMANDS\n\n" +
      "• !lock on — Enable all locks\n" +
      "• !lock off — Disable protection\n" +
      "• !lock status — Show lock status\n" +
      "• !lock name <name> — Set & lock name\n" +
      "• !lock emoji <emoji> — Set & lock emoji\n" +
      "• Reply to photo + !lock image — Set & lock image",
      threadID,
      event.messageID
    );
  }

  if (subCommand === "status") {
    return api.sendMessage(formatStatus(threadID), threadID, event.messageID);
  }

  if (subCommand === "on") {
    try {
      const info = await api.getThreadInfo(threadID);
      const imagePath = getGroupImagePath(threadID);

      if (info.imageSrc) {
        try {
          await downloadImage(info.imageSrc, imagePath);
        } catch (error) {
          console.error("❌ Could not save group image:", error.message);
        }
      }

      protectData[threadID] = {
        ...(protectData[threadID] || {}),
        name: info.threadName || "",
        emoji: info.emoji || "",
        image: fs.existsSync(imagePath) ? imagePath : "",
        lockName: true,
        lockEmoji: true,
        lockImage: fs.existsSync(imagePath),
        protect: true,
        updatedAt: new Date().toISOString()
      };

      saveProtectData();

      return api.sendMessage(
        "🔒 GROUP PROTECTION ENABLED!\n\n" +
        "✅ Name: LOCKED\n" +
        "✅ Emoji: LOCKED\n" +
        `✅ Image: ${protectData[threadID].lockImage ? "LOCKED" : "NOT SAVED"}\n\n` +
        "♻️ Protection data is persistent after restart.",
        threadID,
        event.messageID
      );
    } catch (error) {
      console.error("❌ Lock ON Error:", error);
      return api.sendMessage(
        "❌ Failed to enable protection.",
        threadID,
        event.messageID
      );
    }
  }

  if (subCommand === "off") {
    if (!protectData[threadID]) {
      return api.sendMessage(
        "⚠️ Protection is already OFF.",
        threadID,
        event.messageID
      );
    }

    protectData[threadID].protect = false;
    protectData[threadID].updatedAt = new Date().toISOString();
    saveProtectData();

    return api.sendMessage(
      "🔓 GROUP PROTECTION DISABLED!\n\n" +
      "The saved protection settings remain available and can be enabled again with !lock on.",
      threadID,
      event.messageID
    );
  }

  if (subCommand === "name") {
    const name = args.slice(1).join(" ").trim();

    if (!name) {
      return api.sendMessage(
        "❌ Example: !lock name My Group",
        threadID,
        event.messageID
      );
    }

    try {
      await api.setTitle(name, threadID);

      protectData[threadID] = {
        ...(protectData[threadID] || {}),
        name,
        lockName: true,
        protect: true,
        updatedAt: new Date().toISOString()
      };

      saveProtectData();

      return api.sendMessage(
        `✅ Group name updated and locked!\n\n📌 ${name}`,
        threadID,
        event.messageID
      );
    } catch (error) {
      return api.sendMessage(
        "❌ Failed to change group name.",
        threadID,
        event.messageID
      );
    }
  }

  if (subCommand === "emoji") {
    const emoji = args.slice(1).join(" ").trim();

    if (!emoji) {
      return api.sendMessage(
        "❌ Example: !lock emoji ❤️",
        threadID,
        event.messageID
      );
    }

    try {
      await api.changeThreadEmoji(emoji, threadID);

      protectData[threadID] = {
        ...(protectData[threadID] || {}),
        emoji,
        lockEmoji: true,
        protect: true,
        updatedAt: new Date().toISOString()
      };

      saveProtectData();

      return api.sendMessage(
        `✅ Group emoji updated and locked!\n\n😀 ${emoji}`,
        threadID,
        event.messageID
      );
    } catch (error) {
      return api.sendMessage(
        "❌ Failed to change group emoji.",
        threadID,
        event.messageID
      );
    }
  }

  if (subCommand === "image") {
    const reply = event.messageReply;

    if (
      event.type !== "message_reply" ||
      !reply?.attachments?.length
    ) {
      return api.sendMessage(
        "❌ Reply to exactly one photo and use:\n!lock image",
        threadID,
        event.messageID
      );
    }

    if (reply.attachments.length !== 1) {
      return api.sendMessage(
        "❌ Please reply to only one photo.",
        threadID,
        event.messageID
      );
    }

    const photoUrl = reply.attachments[0].url;
    const imagePath = getGroupImagePath(threadID);

    try {
      await downloadImage(photoUrl, imagePath);

      await api.changeGroupImage(
        fs.createReadStream(imagePath),
        threadID
      );

      protectData[threadID] = {
        ...(protectData[threadID] || {}),
        image: imagePath,
        lockImage: true,
        protect: true,
        updatedAt: new Date().toISOString()
      };

      saveProtectData();
      safeDelete(imagePath);

      // Keep the protected image permanently by re-downloading it
      // from the current group avatar on the next startup if needed.
      return api.sendMessage(
        "✅ Group image changed and protection enabled!\n\n" +
        "🖼️ Image Lock: ON",
        threadID,
        event.messageID
      );
    } catch (error) {
      console.error("❌ Image Error:", error);
      safeDelete(imagePath);

      return api.sendMessage(
        "❌ Failed to change or lock group image.",
        threadID,
        event.messageID
      );
    }
  }

  return api.sendMessage(
    "❌ Unknown command.\n\nUse !lock status to see available options.",
    threadID,
    event.messageID
  );
};

module.exports.handleEvent = async ({ api, event }) => {
  const threadID = event.threadID;

  if (!threadID || !isLocked(threadID)) return;

  try {
    const saved = getState(threadID);
    const threadInfo = await api.getThreadInfo(threadID);

    // Group admins are ignored to reduce false positives.
    // Remove this block if you want the lock to react to admin changes too.
    if (isAdmin(threadInfo, event.senderID)) return;

    let action = "";

    if (
      saved.lockName &&
      event.logMessageType === "log:thread-name"
    ) {
      if (saved.name !== undefined && threadInfo.threadName !== saved.name) {
        await api.setTitle(saved.name, threadID);
        action = "Group Name";
      }
    } else if (
      saved.lockEmoji &&
      event.logMessageType === "log:thread-emoji"
    ) {
      if (saved.emoji !== undefined && threadInfo.emoji !== saved.emoji) {
        await api.changeThreadEmoji(saved.emoji, threadID);
        action = "Group Emoji";
      }
    } else if (
      saved.lockImage &&
      event.logMessageType === "log:thread-icon"
    ) {
      // Image restoration is intentionally skipped here because
      // Facebook may provide only a remote URL and the saved local
      // file may not exist after cleanup/restart.
      action = "Group Image Changed";
    }

    if (action) {
      await sendOwnerNotice(
        api,
        "🚨 GROUP LOCK ALERT!\n\n" +
        `👥 Group: ${threadInfo.threadName || "Unknown"}\n` +
        `🆔 Group ID: ${threadID}\n` +
        `👤 User ID: ${event.senderID || "Unknown"}\n\n` +
        `⚠️ Detected: ${action}\n` +
        "🔒 Protection: ACTIVE"
      );
    }
  } catch (error) {
    console.error("❌ Handle Event Error:", error.message);
  }
};

module.exports.onLoad = async ({ api }) => {
  loadProtectData();

  const lockedGroups = Object.keys(protectData).filter(
    threadID => protectData[threadID]?.protect
  );

  console.log(
    `🛡️ Advanced group protection loaded: ${lockedGroups.length} group(s).`
  );

  for (const threadID of lockedGroups) {
    await sleep(500);

    try {
      await restoreProtection(api, threadID, "Bot Restart / Startup Check");
    } catch (error) {
      console.error(
        `❌ Startup check failed for ${threadID}:`,
        error.message
      );
    }
  }
};
