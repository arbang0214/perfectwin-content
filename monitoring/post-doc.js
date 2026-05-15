#!/usr/bin/env node
/**
 * 마크다운 문서 한 편을 Slack 채널에 단일 메시지로 게시한다.
 *
 * 사용법:
 *   node monitoring/post-doc.js <markdown_path> [title]
 *
 * 예시:
 *   node monitoring/post-doc.js monitoring/docs/metrics-overview.md "📊 모니터링 데이터 가이드"
 *
 * 환경변수:
 *   SLACK_BOT_TOKEN + SLACK_CHANNEL_ID  (우선)
 *   SLACK_WEBHOOK_URL                    (fallback)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const { sendUnifiedDailyToSlack } = require("./utils/slack-sender");

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node monitoring/post-doc.js <markdown_path> [title]");
    process.exit(1);
  }
  return { docPath: args[0], title: args[1] || null };
}

function deriveTitleFromMarkdown(md) {
  const firstHeading = md.split("\n").find((l) => l.startsWith("# "));
  return firstHeading ? firstHeading.replace(/^#\s*/, "").trim() : "📢 PerfecTwin 모니터링 안내";
}

async function main() {
  const { docPath, title: titleArg } = parseArgs();
  const absPath = path.resolve(docPath);

  if (!fs.existsSync(absPath)) {
    console.error(`❌ 파일 없음: ${absPath}`);
    process.exit(1);
  }

  const body = fs.readFileSync(absPath, "utf-8");
  const title = titleArg || deriveTitleFromMarkdown(body);

  console.log(`📄 문서: ${absPath}`);
  console.log(`📌 제목: ${title}`);
  console.log(`📨 Slack 발송 중...\n`);

  const ok = await sendUnifiedDailyToSlack({ title, body });
  if (!ok) {
    console.error("\n❌ Slack 발송 실패 — SLACK_BOT_TOKEN / SLACK_WEBHOOK_URL 환경변수 확인");
    process.exit(1);
  }

  console.log("\n✅ Slack 게시 완료");
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
