#!/usr/bin/env node
/**
 * PerfecTwin 일간 성과 리포트
 *
 * 매일 실행하여 어제의 GA4 + GSC 데이터를 수집하고,
 * 콘솔 출력 + Slack 전송 + JSON 스냅샷 저장을 수행한다.
 *
 * 사용법:
 *   node monitoring/daily-report.js
 *   node monitoring/daily-report.js --date 2026-03-26  (특정 날짜 지정)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const { collectGA4 } = require("./collectors/ga4");
const { collectGSC } = require("./collectors/gsc");
const { collectInblog } = require("./collectors/inblog");
const { formatDailyReport } = require("./formatters/slack-message");
const { sendToSlack, sendReportToSlack } = require("./utils/slack-sender");
const { generateDailyReports } = require("./report-generator");

const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");

// ─── 유틸리티 ────────────────────────────────────────────
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) return args[i + 1];
  }
  return null;
}

/**
 * 전일 JSON 스냅샷을 로드한다 (전일 대비 비교용).
 */
function loadPreviousData(targetDate) {
  const d = new Date(targetDate);
  d.setDate(d.getDate() - 1);
  const prevDate = d.toISOString().split("T")[0];
  const prevFile = path.join(DATA_DIR, `${prevDate}.json`);

  if (fs.existsSync(prevFile)) {
    try {
      return JSON.parse(fs.readFileSync(prevFile, "utf-8"));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * 오늘 수집한 데이터를 JSON 스냅샷으로 저장한다.
 */
function saveSnapshot(targetDate, data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const snapshot = {
    date: targetDate,
    collectedAt: new Date().toISOString(),
    ga4: data.ga4 || null,
    gsc: data.gsc || null,
    inblog: data.inblog || null,
    slack: { sent: data.slackSent, timestamp: new Date().toISOString() },
  };

  const filePath = path.join(DATA_DIR, `${targetDate}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`\n[저장] ${filePath}`);
}

// ─── 메인 실행 ───────────────────────────────────────────
async function main() {
  const targetDate = parseArgs() || getYesterday();
  console.log(`\n🚀 PerfecTwin 일간 리포트 — 대상 날짜: ${targetDate}`);
  console.log(`   실행 시각: ${new Date().toLocaleString("ko-KR")}\n`);

  let ga4Data = null;
  let gscData = null;
  let inblogData = null;

  // 1. GA4 데이터 수집
  console.log("[1/5] GA4 데이터 수집...");
  try {
    ga4Data = await collectGA4(targetDate);
    console.log("  ✅ GA4 수집 완료");
  } catch (err) {
    console.error(`  ❌ GA4 수집 실패: ${err.message}`);
  }

  // 2. GSC 데이터 수집
  console.log("[2/5] GSC 데이터 수집...");
  try {
    gscData = await collectGSC(targetDate);
    console.log("  ✅ GSC 수집 완료");
  } catch (err) {
    console.error(`  ❌ GSC 수집 실패: ${err.message}`);
  }

  // 3. inblog 데이터 수집
  console.log("[3/5] inblog 데이터 수집...");
  try {
    inblogData = await collectInblog(targetDate);
    if (inblogData) {
      console.log("  ✅ inblog 수집 완료");
    }
  } catch (err) {
    console.error(`  ❌ inblog 수집 실패: ${err.message}`);
  }

  // 모두 실패한 경우
  if (!ga4Data && !gscData && !inblogData) {
    const errorMsg = `⚠️ PerfecTwin 모니터링 — ${targetDate}\n\n모든 데이터 소스 수집 실패. API 설정을 확인하세요.`;
    console.error("\n" + errorMsg);
    await sendToSlack(errorMsg);
    return;
  }

  // 4. 전일 데이터 로드 + 포맷
  console.log("[4/5] 리포트 생성...");
  const prevData = loadPreviousData(targetDate);
  if (prevData) {
    console.log(`  전일 데이터 로드: ${prevData.date}`);
  } else {
    console.log("  전일 데이터 없음 (첫 실행 또는 누락) — 변화율 생략");
  }

  const reportData = { date: targetDate, ga4: ga4Data, gsc: gscData, inblog: inblogData };
  const reportText = formatDailyReport(reportData, prevData);

  // 콘솔 출력 (항상)
  console.log(reportText);

  // 5. JSON 스냅샷 저장
  console.log("[5/7] JSON 스냅샷 저장...");
  saveSnapshot(targetDate, { ga4: ga4Data, gsc: gscData, inblog: inblogData, slackSent: false });

  // 6. Claude API로 인사이트 리포트 생성 + Slack 발송
  const skipReport = process.argv.includes("--no-report");
  if (!skipReport && process.env.ANTHROPIC_API_KEY) {
    console.log("[6/7] 인사이트 리포트 생성 (Claude API)...");
    try {
      const reports = await generateDailyReports(targetDate);
      if (reports.homepage) console.log("  ✅ 홈페이지 리포트 생성 완료");
      if (reports.blog) console.log("  ✅ 블로그 리포트 생성 완료");

      // 7. 인사이트 리포트를 Slack으로 발송
      console.log("[7/7] 인사이트 리포트 Slack 발송...");
      if (reports.homepage) {
        await sendReportToSlack(reports.homepage, "homepage", targetDate);
      }
      if (reports.blog) {
        await sendReportToSlack(reports.blog, "blog", targetDate);
      }
    } catch (err) {
      console.error(`  ❌ 리포트 생성/발송 실패: ${err.message}`);
    }
  } else if (skipReport) {
    console.log("[6/7] 리포트 생성 건너뜀 (--no-report)");
  }

  console.log("\n✅ 일간 리포트 완료!\n");
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
