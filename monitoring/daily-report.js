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
const { collectBing } = require("./collectors/bing");
const { collectDemoFunnel } = require("./collectors/demo-funnel");
const { collectContentFunnel } = require("./collectors/content-funnel");
const { formatDailyReport } = require("./formatters/slack-message");
const { sendToSlack } = require("./utils/slack-sender");
const { runUnifiedDaily } = require("./unified-daily-report");
const { main: buildDashboard } = require("./build-dashboard");
// Legacy: 통합 리포트로 대체. 호출 안 함. 함수는 export 상태로 유지.
// const { generateDailyReports } = require("./report-generator");
// const { generatePDF } = require("./utils/pdf-generator");
// const { sendReportEmail } = require("./utils/email-sender");
// const { generateLinkedInReport } = require("./linkedin-report");

const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");

// ─── 유틸리티 ────────────────────────────────────────────
function getYesterday() {
  // KST(UTC+9) 기준 "어제" 날짜를 반환한다.
  // cron이 23:00 UTC(=08:00 KST)에 실행되므로, UTC 기준으로는
  // 자정 전후에 따라 날짜가 달라질 수 있다.
  // KST 기준으로 계산하면 23:xx UTC든 00:xx UTC든 항상 동일한 결과.
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() - 1);
  return kst.toISOString().split("T")[0];
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
    bing: data.bing || null,
    inblog: data.inblog || null,
    demoFunnel: data.demoFunnel || null,
    contentFunnel: data.contentFunnel || null,
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

  // backup cron 대응: 같은 날짜의 통합 리포트 Slack 발송이 이미 성공했으면 조기 종료.
  // .md 파일이 아니라 .slack.ok sidecar로 판단해서, 첫 cron이 .md만 쓰고 Slack에서 실패한
  // 케이스에 백업 cron이 자동 재시도하도록 한다.
  if (process.argv.includes("--skip-if-exists")) {
    const sidecarPath = path.join(DATA_DIR, "reports", `unified-daily-${targetDate}.slack.ok`);
    if (fs.existsSync(sidecarPath)) {
      console.log(`[skip] Slack 발송 sidecar 존재 — 워크플로 조기 종료 (${path.basename(sidecarPath)})`);
      return;
    }
    console.log(`[skip-check] Slack sidecar 없음 — 정상 실행 진행\n`);
  }

  let ga4Data = null;
  let gscData = null;
  let inblogData = null;
  let bingData = null;
  let demoFunnelData = null;
  let contentFunnelData = null;

  // 1. GA4 데이터 수집
  console.log("[1/8] GA4 데이터 수집...");
  try {
    ga4Data = await collectGA4(targetDate);
    console.log("  ✅ GA4 수집 완료");
  } catch (err) {
    console.error(`  ❌ GA4 수집 실패: ${err.message}`);
  }

  // 2. GSC 데이터 수집
  console.log("[2/8] GSC 데이터 수집...");
  try {
    gscData = await collectGSC(targetDate);
    console.log("  ✅ GSC 수집 완료");
  } catch (err) {
    console.error(`  ❌ GSC 수집 실패: ${err.message}`);
  }

  // 3. Bing 데이터 수집
  console.log("[3/8] Bing 데이터 수집...");
  try {
    bingData = await collectBing(targetDate);
    if (bingData) {
      console.log("  ✅ Bing 수집 완료");
    }
  } catch (err) {
    console.error(`  ❌ Bing 수집 실패: ${err.message}`);
  }

  // 4. inblog 데이터 수집
  console.log("[4/8] inblog 데이터 수집...");
  try {
    inblogData = await collectInblog(targetDate);
    if (inblogData) {
      console.log("  ✅ inblog 수집 완료");
    }
  } catch (err) {
    console.error(`  ❌ inblog 수집 실패: ${err.message}`);
  }

  // 5. Demo Funnel (GA4 기반 데모 신청 어트리뷰션)
  console.log("[5/8] Demo Funnel 데이터 수집...");
  try {
    demoFunnelData = await collectDemoFunnel(targetDate);
    const submits = demoFunnelData?.summary?.submissions ?? 0;
    const intent = demoFunnelData?.summary?.demoPageSessions ?? 0;
    console.log(`  ✅ Demo Funnel 수집 완료 (의향 ${intent}, 완료 ${submits})`);
  } catch (err) {
    console.error(`  ❌ Demo Funnel 수집 실패: ${err.message}`);
  }

  // 6. Content Funnel (UTM 박힌 트래픽의 캠페인별 행동·전환)
  console.log("[6/8] Content Funnel 데이터 수집...");
  try {
    contentFunnelData = await collectContentFunnel(targetDate);
    const n = contentFunnelData?.summary?.campaignCount ?? 0;
    const sess = contentFunnelData?.summary?.totalSessions ?? 0;
    console.log(`  ✅ Content Funnel 수집 완료 (${n}개 캠페인, ${sess} 세션)`);
  } catch (err) {
    console.error(`  ❌ Content Funnel 수집 실패: ${err.message}`);
  }

  // 모두 실패한 경우
  if (!ga4Data && !gscData && !inblogData) {
    const errorMsg = `⚠️ PerfecTwin 모니터링 — ${targetDate}\n\n모든 데이터 소스 수집 실패. API 설정을 확인하세요.`;
    console.error("\n" + errorMsg);
    await sendToSlack(errorMsg);
    return;
  }

  // 6. 콘솔 1차 출력 (디버깅·로컬 확인용)
  console.log("[7/8] 콘솔 1차 출력 + 스냅샷 저장...");
  const prevData = loadPreviousData(targetDate);
  if (prevData) {
    console.log(`  전일 데이터 로드: ${prevData.date}`);
  } else {
    console.log("  전일 데이터 없음 (첫 실행 또는 누락) — 변화율 생략");
  }

  const reportData = { date: targetDate, ga4: ga4Data, gsc: gscData, inblog: inblogData, demoFunnel: demoFunnelData, contentFunnel: contentFunnelData };
  const reportText = formatDailyReport(reportData, prevData);
  console.log(reportText);
  saveSnapshot(targetDate, { ga4: ga4Data, gsc: gscData, bing: bingData, inblog: inblogData, demoFunnel: demoFunnelData, contentFunnel: contentFunnelData, slackSent: false });

  // 7. 누적 대시보드 데이터 빌드 (dashboard/data.json) — Slack 발송과 독립.
  // Slack이 실패해도 스냅샷·대시보드는 갱신돼야 하므로 Slack보다 먼저 돌린다.
  try {
    buildDashboard();
  } catch (err) {
    console.error(`  [dashboard] 빌드 실패: ${err.message}`);
  }

  // 8. 통합 일간 리포트 생성 + Slack 발송 — 실패 시 throw해서 워크플로 fail로 노출.
  // 데이터 커밋 step은 if: always()로 돌아서 스냅샷·.md는 보존되고, sidecar(.slack.ok)가
  // 없으면 백업 cron이 재시도한다.
  const skipReport = process.argv.includes("--no-report");
  if (!skipReport && process.env.ANTHROPIC_API_KEY) {
    console.log("[8/8] 통합 일간 리포트 생성 + Slack 발송...");
    await runUnifiedDaily(targetDate);
    console.log("  ✅ 통합 리포트 발송 완료");
  } else if (skipReport) {
    console.log("[8/8] 리포트 생성 건너뜀 (--no-report)");
  }

  console.log("\n✅ 일간 리포트 완료!\n");
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
