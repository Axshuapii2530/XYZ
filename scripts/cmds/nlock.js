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
    version: "4.6",
    author: "Lord Denish (fixed)",
    countDown: 5,
    role: 2,
    shortDescription: "Silent nickname lock",
    longDescription: "Locks nicknames silently & restores on change",
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

      if (!data[threadID]) {
        data[threadID] = {
          locked: true,
          uniform: true,
          defaultNick: newNick,
          nicks: {}
        };
      }

      for (const uid of threadInfo.participantIDs) {
        try {
          const currentNick = threadInfo.nicknames?.[uid] || "";

          if (currentNick === newNick) {
            data[threadID].nicks[uid] = { value: newNick, ts: Date.now() };
            continue;
          }

          await api.changeNickname(newNick, threadID, uid);
          data[threadID].nicks[uid] = { value: newNick, ts: Date.now() };

          await delay(1000);
        } catch {}
      }

      data[threadID].locked = true;
      data[threadID].uniform = true;
      data[threadID].defaultNick = newNick;
      saveData(data);

      console.log(`🔒 Nickname Lock ON | ${threadID} | ${newNick}`);
    } catch {}
  },

  onEvent: async function ({ api, event }) {
    const data = loadData();
    const { threadID } = event;

    if (!data[threadID]?.locked) return;

    // Nickname change event
    if (event.logMessageType !== "log:user-nickname") return;

    const uid = event.logMessageData?.participant_id;
    const newNick = event.logMessageData?.nickname || "";

    if (!uid) return;

    const lockedNick = data[threadID].defaultNick;

    // Bot admin UIDs (edit here)
    const botAdmins = [
      "1000xxxxxxxxxx",
      "1000yyyyyyyyyy"
    ];

    // Admin allowed → update lock
    if (botAdmins.includes(event.author)) {
      data[threadID].defaultNick = newNick;
      saveData(data);
      return;
    }

    // Already correct
    if (newNick === lockedNick) return;

    const last = data[threadID].nicks[uid]?.ts || 0;
    if (Date.now() - last < 8000) return; // loop protection

    try {
      await delay(1500);
      await api.changeNickname(lockedNick, threadID, uid);

      data[threadID].nicks[uid] = {
        value: lockedNick,
        ts: Date.now()
      };
      saveData(data);
    } catch {}
  }
};
