#!/usr/bin/env node
/**
 * Slack 요약 재발송 스크립트
 * 이미 생성된 .md 리포트의 요약을 Slack으로 재발송한다.
 *
 * 사용법:
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/... node monitoring/resend-slack-summary.js --date 2026-04-10
 *   node monitoring/resend-slack-summary.js                # 가장 최근 리포트 자동 감지
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const { sendReportToSlack } = require("./utils/slack-sender");

const REPORTS_DIR = path.join(__dirname, "..", "data", "monitoring", "reports");

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) return args[i + 1];
  }
  return null;
}

function findLatestDate() {
  const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.startsWith("homepage-daily-") && f.endsWith(".md"));
  if (files.length === 0) return null;
  files.sort();
  const match = files[files.length - 1].match(/homepage-daily-(\d{4}-\d{2}-\d{2})\.md/);
  return match ? match[1] : null;
}

async function main() {
  const targetDate = parseArgs() || findLatestDate();
  if (!targetDate) {
    console.error("리포트 날짜를 찾을 수 없습니다. --date YYYY-MM-DD로 지정하세요.");
    process.exit(1);
  }

  console.log(`\n📤 Slack 요약 재발송 — 대상 날짜: ${targetDate}\n`);

  const homepagePath = path.join(REPORTS_DIR, `homepage-daily-${targetDate}.md`);
  const blogPath = path.join(REPORTS_DIR, `blog-daily-${targetDate}.md`);

  let sent = 0;

  if (fs.existsSync(homepagePath)) {
    const report = fs.readFileSync(homepagePath, "utf-8");
    console.log("[1/2] 홈페이지 요약 발송...");
    const ok = await sendReportToSlack(report, "daily", targetDate);
    if (ok) { sent++; console.log("  ✅ 홈페이지 요약 발송 성공"); }
    else { console.error("  ❌ 홈페이지 요약 발송 실패"); }
  } else {
    console.log(`[1/2] 홈페이지 리포트 없음: ${homepagePath}`);
  }

  if (fs.existsSync(blogPath)) {
    const report = fs.readFileSync(blogPath, "utf-8");
    console.log("[2/2] 블로그 요약 발송...");
    const ok = await sendReportToSlack(report, "daily", targetDate);
    if (ok) { sent++; console.log("  ✅ 블로그 요약 발송 성공"); }
    else { console.error("  ❌ 블로그 요약 발송 실패"); }
  } else {
    console.log(`[2/2] 블로그 리포트 없음: ${blogPath}`);
  }

  console.log(`\n${sent > 0 ? "✅" : "❌"} 완료 — ${sent}건 발송\n`);
}

main().catch((err) => {
  console.error("오류:", err);
  process.exit(1);
});
