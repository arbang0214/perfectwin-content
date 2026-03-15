const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.resolve(__dirname, "../../output");

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function createWeekFolder(stamp) {
  const s = stamp || todayStamp();
  const weekDir = path.join(OUTPUT_DIR, `week-${s}`);
  for (const sub of ["content", "image-prompts", "images", "meta"]) {
    fs.mkdirSync(path.join(weekDir, sub), { recursive: true });
  }
  return weekDir;
}

function saveContent(weekDir, subfolder, filename, content) {
  const filePath = subfolder
    ? path.join(weekDir, subfolder, filename)
    : path.join(weekDir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function readContent(weekDir, subfolder, filename) {
  const filePath = subfolder
    ? path.join(weekDir, subfolder, filename)
    : path.join(weekDir, filename);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : null;
}

function fileExists(weekDir, subfolder, filename) {
  const filePath = subfolder
    ? path.join(weekDir, subfolder, filename)
    : path.join(weekDir, filename);
  return fs.existsSync(filePath);
}

function listWeekFolders() {
  if (!fs.existsSync(OUTPUT_DIR)) return [];
  return fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith("week-") && fs.statSync(path.join(OUTPUT_DIR, f)).isDirectory())
    .sort()
    .reverse();
}

function getWeekStructure(weekFolder) {
  const weekPath = path.join(OUTPUT_DIR, weekFolder);
  if (!fs.existsSync(weekPath)) return {};
  const structure = {};
  const entries = fs.readdirSync(weekPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      structure[entry.name] = fs.readdirSync(path.join(weekPath, entry.name));
    } else {
      if (!structure._root) structure._root = [];
      structure._root.push(entry.name);
    }
  }
  return structure;
}

function getOutputDir() {
  return OUTPUT_DIR;
}

module.exports = {
  createWeekFolder,
  saveContent,
  readContent,
  fileExists,
  listWeekFolders,
  getWeekStructure,
  todayStamp,
  getOutputDir,
};
