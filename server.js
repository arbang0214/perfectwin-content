const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const crypto = require("crypto");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Store active jobs
const jobs = new Map();

// ─── POST /api/generate — start generation, return job ID ──
app.post("/api/generate", (req, res) => {
  const { topic, keywords, angle, intel, contentTypes } = req.body;

  if (!topic || !keywords || !angle) {
    return res.status(400).json({ error: "topic, keywords, angle are required" });
  }

  const jobId = crypto.randomUUID();
  const job = { logs: [], status: "running", result: null };
  jobs.set(jobId, job);

  const args = [
    path.join(__dirname, "scripts", "generate-content.js"),
    "--topic", topic,
    "--keywords", keywords,
    "--angle", angle,
  ];
  if (intel) args.push("--intel", intel);
  if (contentTypes && Array.isArray(contentTypes) && contentTypes.length > 0) {
    args.push("--types", contentTypes.join(","));
  }

  const child = spawn(process.execPath, args, {
    cwd: __dirname,
    env: { ...process.env },
  });

  child.stdout.on("data", (chunk) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      job.logs.push({ type: "log", data: line });
    }
  });

  child.stderr.on("data", (chunk) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      job.logs.push({ type: "error", data: line });
    }
  });

  child.on("close", (code) => {
    const outputDir = path.join(__dirname, "output");
    const folders = fs.existsSync(outputDir)
      ? fs.readdirSync(outputDir).filter((f) => f.startsWith("week-")).sort().reverse()
      : [];
    const latest = folders[0];

    if ((code === 0 || code === null) && latest) {
      const structure = getWeekStructure(path.join(outputDir, latest));
      job.result = { folder: latest, structure };
      job.status = "done";
    } else {
      job.status = "error";
      job.logs.push({ type: "error", data: `Process failed (exit code ${code})` });
    }
  });

  res.json({ jobId });
});

// ─── GET /api/generate/:jobId/stream — SSE stream for job ──
app.get("/api/generate/:jobId/stream", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let cursor = 0;

  const interval = setInterval(() => {
    // Send new logs
    while (cursor < job.logs.length) {
      const entry = job.logs[cursor++];
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }

    // Check if done
    if (job.status === "done") {
      res.write(`data: ${JSON.stringify({ type: "done", data: job.result })}\n\n`);
      clearInterval(interval);
      res.end();
      setTimeout(() => jobs.delete(req.params.jobId), 60000);
    } else if (job.status === "error") {
      clearInterval(interval);
      res.end();
      setTimeout(() => jobs.delete(req.params.jobId), 60000);
    }
  }, 500);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// ─── Helper: get nested week folder structure ───────────────
function getWeekStructure(weekPath) {
  const structure = {};
  const entries = fs.readdirSync(weekPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subFiles = fs.readdirSync(path.join(weekPath, entry.name));
      structure[entry.name] = subFiles;
    } else {
      if (!structure._root) structure._root = [];
      structure._root.push(entry.name);
    }
  }
  return structure;
}

// ─── GET /api/outputs — list all week folders with structure ─
app.get("/api/outputs", (req, res) => {
  const outputDir = path.join(__dirname, "output");
  if (!fs.existsSync(outputDir)) return res.json([]);

  const folders = fs.readdirSync(outputDir)
    .filter((f) => f.startsWith("week-") && fs.statSync(path.join(outputDir, f)).isDirectory())
    .sort()
    .reverse()
    .map((folder) => {
      const structure = getWeekStructure(path.join(outputDir, folder));
      return { folder, structure };
    });

  res.json(folders);
});

// ─── /api/output/* — serve output files (nested or flat) ────
app.use("/api/output", (req, res, next) => {
  if (req.method !== "GET") return next();

  // req.url = "/week-2026-03-14/content/blog-ko.md" etc.
  const segments = req.url.split("/").filter(Boolean);
  if (segments.length < 2) {
    return res.status(400).json({ error: "Invalid path" });
  }
  if (segments.some(s => s.includes(".."))) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const filePath = path.join(__dirname, "output", ...segments);
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

app.listen(PORT, () => {
  console.log(`\n  PerfecTwin Content Server running at http://localhost:${PORT}\n`);
});