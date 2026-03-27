/**
 * Slack Incoming Webhook 발송 모듈
 * 인사이트 리포트(Markdown)를 Slack Block Kit 형식으로 발송한다.
 */

const fs = require("fs");
const path = require("path");

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = process.env.SLACK_CHANNEL_ID;

/**
 * Slack으로 텍스트 메시지를 전송한다.
 * @param {string} text - 전송할 메시지 텍스트
 * @returns {boolean} - 전송 성공 여부
 */
async function sendToSlack(text) {
  if (!WEBHOOK_URL) {
    console.log("\n[Slack] SLACK_WEBHOOK_URL 미설정 — 콘솔 출력으로 대체");
    console.log(text);
    return false;
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Slack 응답: ${response.status} ${response.statusText}`);
    }

    console.log("[Slack] 메시지 전송 성공");
    return true;
  } catch (err) {
    console.error(`[Slack] 전송 실패: ${err.message}`);
    saveFallback(text);
    return false;
  }
}

/**
 * 인사이트 리포트를 Slack으로 발송한다.
 * 1개 메시지: 요약 ~10줄 본문 + 상세 리포트 .md 파일 첨부
 * @param {string} reportMd - Markdown 리포트 내용
 * @param {string} label - "homepage" 또는 "blog"
 * @param {string} targetDate - YYYY-MM-DD
 * @returns {boolean}
 */
async function sendReportToSlack(reportMd, label, targetDate) {
  // 리포트 MD 첫 줄에서 제목 추출 (기간 포함)
  const firstLine = reportMd.split("\n").find((l) => l.startsWith("# ")) || "";
  const extractedTitle = firstLine.replace(/^#\s*/, "").trim();
  const title = extractedTitle || `📊 리포트 (${targetDate})`;
  const filename = `${label}-${targetDate}.md`;

  // 요약 추출
  const summary = extractSummary(reportMd);
  const slackSummary = convertToSlackMrkdwn(summary);

  // Bot Token이 있으면: 요약 메시지 + .md 파일 첨부 (1개 스레드)
  if (BOT_TOKEN && CHANNEL_ID) {
    try {
      return await sendWithBotToken(reportMd, title, slackSummary, filename);
    } catch (err) {
      console.warn(`[Slack] Bot API 실패 (${err.message}), Webhook fallback...`);
    }
  }

  // Webhook fallback: 요약 + 상세 리포트 순차 전송
  if (WEBHOOK_URL) {
    const fullSlackMd = convertToSlackMrkdwn(reportMd);
    return await sendFullViaWebhook(title, slackSummary, fullSlackMd);
  }

  console.log(`[Slack] 전송 수단 없음 — 콘솔 출력`);
  return false;
}

/**
 * Bot Token으로 요약 메시지 + .md 파일 첨부
 */
async function sendWithBotToken(reportMd, title, slackSummary, filename) {
  const messageText = `*${title}*\n\n${slackSummary}\n\n📎 _상세 리포트는 첨부 파일을 확인하세요_`;

  const msgRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Authorization": `Bearer ${BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: CHANNEL_ID, text: messageText, mrkdwn: true }),
  });
  const msgData = await msgRes.json();
  if (!msgData.ok) throw new Error(`chat.postMessage: ${msgData.error}`);

  // 스레드에 .md 파일 첨부
  const formData = new FormData();
  formData.append("file", new Blob([reportMd], { type: "text/markdown" }), filename);
  formData.append("channels", CHANNEL_ID);
  formData.append("thread_ts", msgData.ts);
  formData.append("title", `상세 리포트 — ${filename}`);
  formData.append("initial_comment", `📎 상세 리포트`);

  const fileRes = await fetch("https://slack.com/api/files.upload", {
    method: "POST",
    headers: { "Authorization": `Bearer ${BOT_TOKEN}` },
    body: formData,
  });
  const fileData = await fileRes.json();
  if (!fileData.ok) console.warn(`[Slack] 파일 첨부 실패: ${fileData.error} — 메시지만 전송됨`);

  console.log(`[Slack] 리포트 전송 성공 (요약 + .md 파일)`);
  return true;
}

/**
 * Webhook으로 요약 메시지 + 상세 리포트를 순차 전송
 * 1번째 메시지: 요약 (핵심지표 + 인사이트)
 * 2번째 메시지: 상세 리포트 전체
 */
async function sendFullViaWebhook(title, slackSummary, fullSlackMd) {
  try {
    // 1. 요약 메시지
    const summaryBlocks = [
      { type: "header", text: { type: "plain_text", text: title, emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: slackSummary } },
      { type: "divider" },
      { type: "context", elements: [{ type: "mrkdwn", text: "📎 상세 리포트가 다음 메시지에 이어집니다" }] },
    ];

    const res1 = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: summaryBlocks }),
    });
    if (!res1.ok) throw new Error(`요약 전송 실패: ${res1.status}`);

    // 2. 상세 리포트 (블록 분할, 최대 50블록)
    const detailChunks = splitIntoChunks(fullSlackMd, 2900);
    const detailBlocks = [
      { type: "header", text: { type: "plain_text", text: `📎 ${title} — 상세`, emoji: true } },
      ...detailChunks.slice(0, 48).map((chunk) => ({
        type: "section",
        text: { type: "mrkdwn", text: chunk },
      })),
    ];

    const res2 = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks: detailBlocks }),
    });
    if (!res2.ok) {
      console.warn(`[Slack] 상세 리포트 전송 실패 (${res2.status}) — 요약만 전송됨`);
    }

    console.log(`[Slack] 리포트 전송 성공 (요약 + 상세)`);
    return true;
  } catch (err) {
    console.error(`[Slack] Webhook 전송 실패: ${err.message}`);
    return false;
  }
}

/**
 * 리포트에서 Slack 요약을 추출한다.
 * (1) 핵심 지표 요약 2~3줄 + (2) 인사이트 본문 (섹션 헤더 제거)
 */
function extractSummary(reportMd) {
  const lines = reportMd.split("\n");

  // ── 1. 핵심 지표 요약 추출 (첫 번째 테이블에서 주요 수치) ──
  const metricsSummary = extractMetricsSummary(reportMd);

  // ── 2. 인사이트 섹션 추출 (번호 헤더 제거) ──
  let insightStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s*\d*\.?\s*(종합\s*)?인사이트/i.test(lines[i])) {
      insightStart = i;
      break;
    }
  }

  let insightText = "";
  if (insightStart >= 0) {
    const insightLines = [];
    for (let i = insightStart + 1; i < lines.length; i++) {
      if (/^#{1,2}\s/.test(lines[i])) break;
      insightLines.push(lines[i]);
    }
    insightText = insightLines.join("\n").trim();
  }

  // 합치기
  const parts = [];
  if (metricsSummary) parts.push(metricsSummary);
  if (insightText) parts.push(insightText);

  return parts.join("\n\n") || lines.slice(0, 12).join("\n").trim();
}

/**
 * 리포트에서 핵심 지표를 2~3줄로 요약한다.
 * 첫 번째 테이블의 주요 수치를 한 줄 텍스트로 변환.
 */
function extractMetricsSummary(reportMd) {
  // 테이블 행에서 지표|수치 쌍 추출
  const tableRows = reportMd.match(/^\|[^|]+\|[^|]+\|.*$/gm);
  if (!tableRows || tableRows.length < 2) return null;

  // 구분자 행 건너뛰고 데이터 행만
  const dataRows = tableRows.filter((row) => !/^[\s|:-]+$/.test(row.replace(/\|/g, "")));
  if (dataRows.length < 2) return null;

  // 핵심 지표 키워드 매칭
  const keyMetrics = [];
  const keywords = [
    { pattern: /방문자|activeUsers/i, emoji: "👤" },
    { pattern: /세션|sessions/i, emoji: "🔗" },
    { pattern: /페이지뷰|pageViews/i, emoji: "📄" },
    { pattern: /참여율|engagement/i, emoji: "⚡" },
    { pattern: /체류|duration/i, emoji: "⏱️" },
    { pattern: /방문.*visits/i, emoji: "👤" },
    { pattern: /클릭.*clicks/i, emoji: "🖱️" },
    { pattern: /오가닉|organic/i, emoji: "🌱" },
    { pattern: /노출|impressions/i, emoji: "👁️" },
    { pattern: /CTR/i, emoji: "📊" },
    { pattern: /포지션|position|순위/i, emoji: "📍" },
  ];

  for (const row of dataRows.slice(0, 15)) {
    const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const label = cells[0];
    const value = cells[1];

    for (const kw of keywords) {
      if (kw.pattern.test(label) && !keyMetrics.find((m) => m.emoji === kw.emoji)) {
        // 전일 대비 값이 있으면 포함
        const change = cells.find((c) => /^[+(−-]/.test(c.trim()) && c !== value);
        const display = change ? `${value} (${change.trim()})` : value;
        keyMetrics.push({ emoji: kw.emoji, label: label.replace(/\*\*/g, "").replace(/[∟└]/g, "").trim(), value: display });
        break;
      }
    }
    if (keyMetrics.length >= 6) break;
  }

  if (keyMetrics.length === 0) return null;

  // 2~3줄로 포맷
  const line = keyMetrics.map((m) => `${m.emoji} ${m.label}: *${m.value}*`).join("  ·  ");
  return `📌 *핵심 지표*\n${line}`;
}

function getDayOfWeek(dateStr) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[new Date(dateStr).getDay()] + "요일";
}

/**
 * Markdown을 Slack mrkdwn 형식으로 변환한다.
 */
function convertToSlackMrkdwn(md) {
  let text = md;

  // 헤더: # → *굵은글씨* (먼저 처리)
  text = text.replace(/^#### (.+)$/gm, "▸ $1");
  text = text.replace(/^### (.+)$/gm, "\n$1");
  text = text.replace(/^## (.+)$/gm, "\n━━━━━━━━━━━━━━━━━━━━\n*$1*");
  text = text.replace(/^# (.+)$/gm, "*$1*");

  // Markdown **bold** → Slack *bold* (헤더 변환 후에 처리)
  text = text.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // 테이블을 정렬된 텍스트로 변환 (Slack은 테이블 미지원)
  text = text.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_, header, body) => {
    const headers = header.split("|").map((h) => h.trim()).filter(Boolean);
    const rows = body.trim().split("\n").map((row) =>
      row.split("|").map((c) => c.trim()).filter(Boolean)
    );

    let result = "```\n";
    result += headers.join(" │ ") + "\n";
    result += headers.map((h) => "─".repeat(Math.max(h.length, 4))).join("─┼─") + "\n";
    rows.forEach((row) => {
      result += row.join(" │ ") + "\n";
    });
    result += "```\n";
    return result;
  });

  // 리스트
  text = text.replace(/^- \*\*(.+?)\*\*: (.+)$/gm, "• *$1*: $2");
  text = text.replace(/^- (.+)$/gm, "• $1");

  // 빈 줄 정리
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/**
 * 텍스트를 최대 길이 기준으로 분할한다 (줄바꿈 기준).
 */
function splitIntoChunks(text, maxLen) {
  const lines = text.split("\n");
  const chunks = [];
  let current = "";

  for (const line of lines) {
    if ((current + "\n" + line).length > maxLen && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + "\n" + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Slack 전송 실패 시 로컬 파일로 저장한다.
 */
function saveFallback(text) {
  const fallbackDir = path.join(__dirname, "..", "..", "data", "monitoring");
  const fallbackFile = path.join(fallbackDir, `slack-fallback-${new Date().toISOString().split("T")[0]}.txt`);
  try {
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    fs.writeFileSync(fallbackFile, text, "utf-8");
    console.log(`[Slack] fallback 저장: ${fallbackFile}`);
  } catch (writeErr) {
    console.error(`[Slack] fallback 저장 실패: ${writeErr.message}`);
  }
}

module.exports = { sendToSlack, sendReportToSlack };
