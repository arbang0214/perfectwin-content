const express = require("express");
const path = require("path");
const fs = require("fs");
const { listWeekFolders, getWeekStructure, getOutputDir } = require("../scripts/lib/file-manager");

const router = express.Router();

// GET /outputs — list all week folders with structure
router.get("/outputs", (req, res) => {
  const folders = listWeekFolders().map((folder) => ({
    folder,
    structure: getWeekStructure(folder),
  }));
  res.json(folders);
});

// GET /output/* — serve output files (supports nested paths)
router.use("/output", (req, res, next) => {
  if (req.method !== "GET") return next();

  const segments = req.url.split("/").filter(Boolean);
  if (segments.length < 1) return res.status(400).json({ error: "Invalid path" });
  if (segments.some((s) => s.includes(".."))) return res.status(400).json({ error: "Invalid path" });

  const filePath = path.join(getOutputDir(), ...segments);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ error: "File not found" });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const ext = path.extname(filePath);
  if (ext === ".json") {
    res.json(JSON.parse(content));
  } else {
    res.type("text/plain; charset=utf-8").send(content);
  }
});

module.exports = router;
