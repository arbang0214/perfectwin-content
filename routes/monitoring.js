const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");
const REPORTS_DIR = path.join(DATA_DIR, "reports");

// GET /api/monitoring/reports — 저장된 일별 리포트 목록
router.get("/reports", (_req, res) => {
  if (!fs.existsSync(DATA_DIR)) {
    return res.json([]);
  }
  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("slack-fallback"))
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();
  res.json(files);
});

// GET /api/monitoring/report/:date — 특정 날짜 리포트
router.get("/report/:date", (req, res) => {
  const filePath = path.join(DATA_DIR, `${req.params.date}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "해당 날짜 데이터 없음" });
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  res.json(data);
});

// POST /api/monitoring/collect — 수동으로 데이터 수집 실행
router.post("/collect", async (req, res) => {
  const { spawn } = require("child_process");
  const date = req.body.date || null;

  const args = [path.join(__dirname, "..", "monitoring", "daily-report.js")];
  if (date) args.push("--date", date);

  const child = spawn(process.execPath, args, {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  });

  let output = "";
  child.stdout.on("data", (d) => { output += d.toString(); });
  child.stderr.on("data", (d) => { output += d.toString(); });

  child.on("close", (code) => {
    res.json({ success: code === 0, output });
  });
});

// GET /api/monitoring/insight-reports — 인사이트 리포트 목록
router.get("/insight-reports", (_req, res) => {
  if (!fs.existsSync(REPORTS_DIR)) return res.json([]);
  const files = fs.readdirSync(REPORTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const match = f.match(/^(homepage|blog)-(daily|weekly)-(\d{4}-\d{2}-\d{2})\.md$/);
      return match ? { file: f, type: match[1], period: match[2], date: match[3] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || a.type.localeCompare(b.type));
  res.json(files);
});

// GET /api/monitoring/insight-report/:filename — 인사이트 리포트 내용
router.get("/insight-report/:filename", (req, res) => {
  const filePath = path.join(REPORTS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "리포트 없음" });
  const content = fs.readFileSync(filePath, "utf-8");
  res.json({ content });
});

module.exports = router;
