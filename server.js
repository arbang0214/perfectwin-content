require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/generate", require("./routes/generate"));
app.use("/api", require("./routes/output"));
app.use("/api/publish", require("./routes/publish"));
app.use("/api/topics", require("./routes/topics"));
app.use("/api/buffer", require("./routes/buffer"));
app.use("/api/linkedin", require("./routes/linkedin"));
app.use("/api/monitoring", require("./routes/monitoring"));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`\n  PerfecTwin Content Engine  →  http://localhost:${PORT}\n`);

  // Auto-fetch Buffer channels on startup
  if (process.env.BUFFER_API_KEY) {
    const { loadChannels } = require("./routes/buffer");
    loadChannels().catch(() => {});
  }
});