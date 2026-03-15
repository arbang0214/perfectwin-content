const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = path.resolve(__dirname, "../../prompts");
const CONFIG_DIR = path.resolve(__dirname, "../../config");

function loadPrompt(templateName) {
  return fs.readFileSync(path.join(PROMPTS_DIR, templateName), "utf-8");
}

function loadConfig(filename) {
  return fs.readFileSync(path.join(CONFIG_DIR, filename), "utf-8");
}

function buildPrompt(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value || "");
  }
  return result;
}

const brandGuide = (() => {
  try { return loadConfig("brand-guide.md"); } catch { return ""; }
})();

function getSystemPrompt() {
  return brandGuide;
}

module.exports = { loadPrompt, loadConfig, buildPrompt, getSystemPrompt };
