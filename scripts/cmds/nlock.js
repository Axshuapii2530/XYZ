const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "nicknames.json");

// Load data
function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, "utf8");
      return raw.trim() ? JSON.parse(raw) : {};
    }
    return {};
  } catch {
    return {};
  }
}

// Save data
function saveData(data) {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } catch {}
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  config: {
    name: "nicknamelock",
    aliases: ["nlock", "permanick"],
    version: "5.0",
    author: "Lord Denish (enhanced)",
    countDown: 5,
    role: 2,
    shortDescription: "Advanced nickname lock",
    longDescription: "Locks nicknames, auto-updates for new members, replaces old nicknames",
    category: "group",
    guide: "{pn} <nickname> | off"
  },

  onStart: async function ({ api, event, args }) {
    const { threadID } = event;
    const data = loadData();

    if (!args[0]) return;

    // OFF
    if (args[0].toLowerCase() === "off") {
      if (data[threadID]) {
        data[threadID].locked = false;
        saveData(data);
      }
      return;
    }

    const newNick = args.join(" ").trim();
    if (!newNick) return;

    try {
      const threadInfo = await api.getThreadInfo(threadID);
      if (!threadInfo?.participantIDs) return;

      // Clear previous nickname data for this thread
      if (data[threadID]) {
        // Keep locked status but reset nicks
        data[threadID].defaultNick = newNick;
        data[threadID].nicks = {};
      } else {
        data[threadID] = {
          locked: true,
          uniform: true,
          defaultNick: newNick,
          nicks: {}
        };
      }

      // Apply new nickname to all members
      for (const uid of threadInfo.participantIDs) {
        try {
          await api.changeNickname(newNick, threadID, uid);
          data[threadID].nicks[uid] = { value: newNick, ts: Date.now() };
          await delay(800); // Reduced delay for faster processing
        } catch {}
      }

      saveData(data);
      console.log(`🔒 Nickname Updated & Locked | ${threadID} | ${newNick}`);
    } catch {}
  },

  onEvent: async function ({ api, event }) {
    const data = loadData();
    const { threadID } = event;

    if (!data[threadID]?.locked) return;

    // Bot admin UIDs (edit here)
    const botAdmins = [
      "1000xxxxxxxxxx",
      "1000yyyyyyyyyy"
    ];

    // Handle new member joining
    if (event.logMessageType === "log:subscribe") {
      const newParticipants = event.logMessageData?.addedParticipants || [];
      const lockedNick = data[threadID].defaultNick;

      for (const participant of newParticipants) {
        const uid = participant.userFbId;
        if (!uid) continue;

        // Apply nickname after a short delay
        setTimeout(async () => {
          try {
            await api.changeNickname(lockedNick, threadID, uid);
            data[threadID].nicks[uid] = {
              value: lockedNick,
              ts: Date.now()
            };
            saveData(data);
          } catch {}
        }, 2000);
      }
      return;
    }

    // Nickname change event
    if (event.logMessageType !== "log:user-nickname") return;

    const uid = event.logMessageData?.participant_id;
    const newNick = event.logMessageData?.nickname || "";

    if (!uid) return;

    const lockedNick = data[threadID].defaultNick;

    // Admin allowed → update lock
    if (botAdmins.includes(event.author)) {
      // Admin changed nickname, update default
      data[threadID].defaultNick = newNick;
      
      // Apply new nickname to all members
      try {
        const threadInfo = await api.getThreadInfo(threadID);
        for (const participantId of threadInfo.participantIDs) {
          try {
            await api.changeNickname(newNick, threadID, participantId);
            data[threadID].nicks[participantId] = { 
              value: newNick, 
              ts: Date.now() 
            };
            await delay(500);
          } catch {}
        }
      } catch {}
      
      saveData(data);
      return;
    }

    // Already correct
    if (newNick === lockedNick) return;

    const last = data[threadID].nicks[uid]?.ts || 0;
    if (Date.now() - last < 5000) return; // Reduced loop protection

    try {
      await delay(1000);
      await api.changeNickname(lockedNick, threadID, uid);

      data[threadID].nicks[uid] = {
        value: lockedNick,
        ts: Date.now()
      };
      saveData(data);
    } catch {}
  }
};
