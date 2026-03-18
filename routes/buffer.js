const express = require("express");
const router = express.Router();
const { getBufferChannels } = require("../lib/buffer-client");

// In-memory cache of Buffer channels
let cachedChannels = null;

// Channel ID mapping from env vars
function getChannelMap() {
  return {
    "linkedin-company": process.env.BUFFER_LINKEDIN_COMPANY_ID || null,
    "linkedin-personal": process.env.BUFFER_LINKEDIN_PERSONAL_ID || null,
    "x": process.env.BUFFER_X_ID || null,
  };
}

async function loadChannels() {
  try {
    cachedChannels = await getBufferChannels();
    console.log(`[Buffer] Loaded ${cachedChannels.length} channel(s)`);
  } catch (err) {
    console.log(`[Buffer] Failed to load channels: ${err.message}`);
    cachedChannels = [];
  }
  return cachedChannels;
}

// GET /api/buffer/channels
router.get("/channels", async (_req, res) => {
  try {
    const channels = cachedChannels || await loadChannels();
    res.json({ channels, channelMap: getChannelMap() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/buffer/profiles (backwards compat — maps channels to profile-like objects)
router.get("/profiles", async (_req, res) => {
  try {
    const channelMap = getChannelMap();
    const profiles = [];
    if (channelMap["linkedin-company"]) {
      const ch = (cachedChannels || []).find(c => c.id === channelMap["linkedin-company"]);
      profiles.push({ id: channelMap["linkedin-company"], service: "linkedin", serviceType: "page", name: ch?.name || "Company", avatar: "" });
    }
    if (channelMap["linkedin-personal"]) {
      const ch = (cachedChannels || []).find(c => c.id === channelMap["linkedin-personal"]);
      profiles.push({ id: channelMap["linkedin-personal"], service: "linkedin", serviceType: "profile", name: ch?.name || "Personal", avatar: "" });
    }
    if (channelMap["x"]) {
      const ch = (cachedChannels || []).find(c => c.id === channelMap["x"]);
      profiles.push({ id: channelMap["x"], service: "x", serviceType: "profile", name: ch?.name || "X", avatar: "" });
    }
    res.json({ profiles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.loadChannels = loadChannels;
module.exports.getChannelMap = getChannelMap;
