const express = require("express");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { getWeekStructure, listWeekFolders } = require("../scripts/lib/file-manager");

const router = express.Router();
const jobs = new Map();

// POST / — start generation job, return jobId
router.post("/", (req, res) => {
  const { topic, keywords, angle, intel, contentTypes } = req.body;

  if (!topic || !keywords || !angle) {
    return res.status(400).json({ error: "topic, keywords, angle are required" });
  }

  const jobId = crypto.randomUUID();
  const job = { logs: [], status: "running", result: null };
  jobs.set(jobId, job);

  const args = [
    path.join(__dirname, "../scripts/generate-content.js"),
    "--topic", topic,
    "--keywords", keywords,
    "--angle", angle,
  ];
  if (intel) args.push("--intel", intel);
  if (contentTypes && Array.isArray(contentTypes) && contentTypes.length > 0) {
    args.push("--types", contentTypes.join(","));
  }

  const child = spawn(process.execPath, args, {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env },
  });

  child.stdout.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach((line) => {
      job.logs.push({ type: "log", data: line });
    });
  });

  child.stderr.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach((line) => {
      job.logs.push({ type: "error", data: line });
    });
  });

  child.on("close", (code) => {
    const folders = listWeekFolders();
    const latest = folders[0];
    if ((code === 0 || code === null) && latest) {
      const structure = getWeekStructure(latest);
      job.result = { folder: latest, structure };
      job.status = "done";
    } else {
      job.status = "error";
      job.logs.push({ type: "error", data: `Process failed (exit code ${code})` });
    }
  });

  res.json({ jobId });
});

// GET /:jobId/stream — SSE stream for job progress
router.get("/:jobId/stream", (req, res) => {
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
    while (cursor < job.logs.length) {
      res.write(`data: ${JSON.stringify(job.logs[cursor++])}\n\n`);
    }
    if (job.status === "done") {
      res.write(`data: ${JSON.stringify({ type: "done", data: job.result })}\n\n`);
      clearInterval(interval);
      res.end();
      setTimeout(() => jobs.delete(req.params.jobId), 60000);
    } else if (job.status === "error") {
      res.write(`data: ${JSON.stringify({ type: "error", data: "Generation failed" })}\n\n`);
      clearInterval(interval);
      res.end();
      setTimeout(() => jobs.delete(req.params.jobId), 60000);
    }
  }, 500);

  req.on("close", () => clearInterval(interval));
});

module.exports = router;
