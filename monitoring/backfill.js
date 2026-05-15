#!/usr/bin/env node
/**
 * 과거 데이터 일괄 수집 (백필)
 *
 * 사용법:
 *   node monitoring/backfill.js --from 2025-03-27 --to 2026-03-26
 *   node monitoring/backfill.js --from 2025-03-27   (to는 어제가 기본)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const { collectGA4 } = require("./collectors/ga4");
const { collectGSC } = require("./collectors/gsc");
const { collectInblog } = require("./collectors/inblog");
const { collectDemoFunnel } = require("./collectors/demo-funnel");
const { collectContentFunnel } = require("./collectors/content-funnel");

const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");

// ─── 유틸리티 ────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) parsed.from = args[++i];
    if (args[i] === "--to" && args[i + 1]) parsed.to = args[++i];
    if (args[i] === "--skip-existing") parsed.skipExisting = true;
    if (args[i] === "--source") parsed.source = args[++i]; // ga4, gsc, inblog, demo, content, all
  }
  if (!parsed.from) {
    console.error("Usage: node monitoring/backfill.js --from YYYY-MM-DD [--to YYYY-MM-DD] [--skip-existing] [--source ga4|gsc|inblog|demo|content|all]");
    process.exit(1);
  }
  if (!parsed.to) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    parsed.to = d.toISOString().split("T")[0];
  }
  parsed.source = parsed.source || "all";
  return parsed;
}

function getDateRange(from, to) {
  const dates = [];
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function loadExisting(date) {
  const file = path.join(DATA_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
}

function saveSnapshot(date, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, `${date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── 메인 ────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const dates = getDateRange(args.from, args.to);

  console.log(`\n🔄 백필 시작: ${args.from} → ${args.to} (${dates.length}일)`);
  console.log(`   소스: ${args.source}`);
  console.log(`   기존 데이터 건너뛰기: ${args.skipExisting ? "예" : "아니오 (덮어쓰기)"}\n`);

  const doGA4 = args.source === "all" || args.source === "ga4";
  const doGSC = args.source === "all" || args.source === "gsc";
  const doInblog = args.source === "all" || args.source === "inblog";
  const doDemo = args.source === "all" || args.source === "demo";
  const doContent = args.source === "all" || args.source === "content";

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const progress = `[${i + 1}/${dates.length}]`;

    // 기존 데이터 체크
    const existing = loadExisting(date);
    if (args.skipExisting && existing) {
      // 요청한 소스가 이미 있는지 확인
      const hasGA4 = !doGA4 || existing.ga4;
      const hasGSC = !doGSC || existing.gsc;
      const hasInblog = !doInblog || existing.inblog;
      const hasDemo = !doDemo || existing.demoFunnel;
      const hasContent = !doContent || existing.contentFunnel;
      if (hasGA4 && hasGSC && hasInblog && hasDemo && hasContent) {
        skipped++;
        if (i % 30 === 0) console.log(`${progress} ${date} — 건너뜀 (기존 데이터 있음)`);
        continue;
      }
    }

    const snapshot = existing || {
      date,
      collectedAt: new Date().toISOString(),
      ga4: null,
      gsc: null,
      inblog: null,
      demoFunnel: null,
      contentFunnel: null,
      slack: { sent: false, timestamp: null },
    };

    let collected = false;

    // GA4
    if (doGA4) {
      try {
        snapshot.ga4 = await collectGA4(date);
        collected = true;
      } catch (err) {
        if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
          console.log(`${progress} ${date} — GA4 속도 제한, 30초 대기...`);
          await delay(30000);
          try {
            snapshot.ga4 = await collectGA4(date);
            collected = true;
          } catch { /* 재시도 실패 */ }
        }
      }
    }

    // GSC
    if (doGSC) {
      try {
        snapshot.gsc = await collectGSC(date);
        collected = true;
      } catch (err) {
        if (err.message?.includes("429") || err.message?.includes("rateLimitExceeded")) {
          console.log(`${progress} ${date} — GSC 속도 제한, 30초 대기...`);
          await delay(30000);
          try {
            snapshot.gsc = await collectGSC(date);
            collected = true;
          } catch { /* 재시도 실패 */ }
        }
      }
    }

    // inblog
    if (doInblog) {
      try {
        snapshot.inblog = await collectInblog(date);
        collected = true;
      } catch { /* 무시 */ }
    }

    // demo funnel (GA4)
    if (doDemo) {
      try {
        snapshot.demoFunnel = await collectDemoFunnel(date);
        collected = true;
      } catch (err) {
        if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
          console.log(`${progress} ${date} — Demo Funnel 속도 제한, 30초 대기...`);
          await delay(30000);
          try {
            snapshot.demoFunnel = await collectDemoFunnel(date);
            collected = true;
          } catch { /* 재시도 실패 */ }
        }
      }
    }

    // content funnel (GA4 — UTM 박힌 트래픽 행동·전환)
    if (doContent) {
      try {
        snapshot.contentFunnel = await collectContentFunnel(date);
        collected = true;
      } catch (err) {
        if (err.message?.includes("429") || err.message?.includes("RESOURCE_EXHAUSTED")) {
          console.log(`${progress} ${date} — Content Funnel 속도 제한, 30초 대기...`);
          await delay(30000);
          try {
            snapshot.contentFunnel = await collectContentFunnel(date);
            collected = true;
          } catch { /* 재시도 실패 */ }
        }
      }
    }

    if (collected) {
      snapshot.collectedAt = new Date().toISOString();
      saveSnapshot(date, snapshot);
      success++;

      // 진행 상황 출력 (10일마다 + 처음/마지막)
      if (i === 0 || i === dates.length - 1 || (i + 1) % 10 === 0) {
        const ga4Users = snapshot.ga4?.summary?.activeUsers ?? "-";
        const gscImpressions = snapshot.gsc?.sites?.reduce((sum, s) => sum + (s.totals?.impressions || 0), 0) ?? "-";
        const inblogVisits = snapshot.inblog?.blogs?.reduce((sum, b) => sum + (b.traffic?.data?.[0]?.visits || 0), 0) ?? "-";
        console.log(`${progress} ${date} — GA4: ${ga4Users}명, GSC: ${gscImpressions}노출, inblog: ${inblogVisits}방문`);
      }
    } else {
      failed++;
      if (i % 30 === 0) console.log(`${progress} ${date} — 수집 실패`);
    }

    // API 속도 제한 대응: 요청 간 간격
    if (doGA4 || doGSC || doDemo || doContent) await delay(500);
  }

  console.log(`\n✅ 백필 완료!`);
  console.log(`   성공: ${success}일, 건너뜀: ${skipped}일, 실패: ${failed}일`);
  console.log(`   저장 경로: ${DATA_DIR}\n`);
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
