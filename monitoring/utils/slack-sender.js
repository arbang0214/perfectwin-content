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
/**
 * @param {string} reportMd - Markdown 리포트
 * @param {string} label - "daily" | "weekly" | "monthly"
 * @param {string} targetDate - YYYY-MM-DD
 */
async function sendReportToSlack(reportMd, label, targetDate) {
  const firstLine = reportMd.split("\n").find((l) => l.startsWith("# ")) || "";
  const extractedTitle = firstLine.replace(/^#\s*/, "").trim();
  const title = extractedTitle || `📊 리포트 (${targetDate})`;

  const insightCount = label === "daily" ? 3 : 5;
  const summary = extractSummary(reportMd, insightCount);
  const slackSummary = convertToSlackMrkdwn(summary);

  if (WEBHOOK_URL) {
    return await sendSummaryViaWebhook(title, slackSummary);
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
 * Webhook으로 요약 메시지만 전송 (상세 리포트는 이메일 PDF로 발송)
 */
async function sendSummaryViaWebhook(title, slackSummary) {
  try {
    const blocks = [
      { type: "header", text: { type: "plain_text", text: title, emoji: true } },
    ];

    // Slack section 블록 text는 3000자 제한 → 분할
    const chunks = splitIntoChunks(slackSummary, 2900);
    for (const chunk of chunks) {
      blocks.push({ type: "section", text: { type: "mrkdwn", text: chunk } });
    }

    blocks.push({ type: "divider" });
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "📎 상세 리포트는 이메일(PDF)로 발송됩니다" }] });

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    if (!res.ok) throw new Error(`전송 실패: ${res.status}`);

    console.log(`[Slack] 요약 전송 성공`);
    return true;
  } catch (err) {
    console.error(`[Slack] 요약 전송 실패: ${err.message}`);
    return false;
  }
}

/**
 * 리포트에서 Slack 요약을 추출한다.
 * 형식: 지표 요약 1줄 + 인사이트 N개
 * @param {string} reportMd - Markdown 리포트
 * @param {number} insightCount - 인사이트 개수 (일간: 3, 주간/월간: 5)
 */
function extractSummary(reportMd, insightCount = 3) {
  const lines = reportMd.split("\n");

  // ── 1. 지표 요약 1줄 (테이블 → 한 줄 or 텍스트 핵심 요약 첫 줄) ──
  const metricsLine = extractMetricsOneLiner(reportMd);

  // ── 2. 인사이트 N개 (## 섹션 헤더에서 찾기, # 제목 제외) ──
  let insightStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,4}\s*\d*\.?\s*.*인사이트/i.test(lines[i])) {
      insightStart = i;
      break;
    }
  }

  let insightText = "";
  if (insightStart >= 0) {
    const insightItems = [];
    for (let i = insightStart + 1; i < lines.length; i++) {
      if (/^#{1,2}\s/.test(lines[i])) break;
      const match = lines[i].match(/^###\s*(.+)/);
      if (match) {
        insightItems.push(`• ${match[1].replace(/\*\*/g, "").trim()}`);
      }
    }
    // 인사이트가 ### 형태가 아닌 경우 (번호 리스트, 볼드 리스트 등)
    if (insightItems.length === 0) {
      for (let i = insightStart + 1; i < lines.length; i++) {
        if (/^#{1,2}\s/.test(lines[i])) break;
        const bulletMatch = lines[i].match(/^[-*]\s+\*\*(.+?)\*\*/);
        const numMatch = lines[i].match(/^\d+\.\s+\*\*(.+?)\*\*/);
        if (bulletMatch) insightItems.push(`• ${bulletMatch[1].trim()}`);
        else if (numMatch) insightItems.push(`• ${numMatch[1].trim()}`);
      }
    }
    if (insightItems.length > 0) {
      insightText = `💡 *인사이트*\n${insightItems.slice(0, insightCount).join("\n")}`;
    }
  }

  const parts = [];
  if (metricsLine) parts.push(metricsLine);
  if (insightText) parts.push(insightText);

  return parts.join("\n\n") || lines.slice(0, 8).join("\n").trim();
}

/**
 * 리포트에서 핵심 지표를 1줄로 요약한다.
 * 1) 테이블에서 주요 수치 추출 → 1줄
 * 2) 테이블 없으면 "핵심 요약" 섹션 텍스트 첫 줄 사용
 */
function extractMetricsOneLiner(reportMd) {
  // 테이블에서 지표 추출 시도
  const tableRows = reportMd.match(/^\|[^|]+\|[^|]+\|.*$/gm);
  if (tableRows && tableRows.length >= 2) {
    const dataRows = tableRows.filter((row) => !/^[\s|:-]+$/.test(row.replace(/\|/g, "")));
    const keyMetrics = [];
    const keywords = [
      { pattern: /방문자|activeUsers|사용자/i, label: "방문자" },
      { pattern: /세션|sessions/i, label: "세션" },
      { pattern: /페이지뷰|pageViews/i, label: "PV" },
      { pattern: /참여율|engagement/i, label: "참여율" },
      { pattern: /방문수|visits/i, label: "방문" },
      { pattern: /클릭수|clicks/i, label: "클릭" },
      { pattern: /오가닉|organic/i, label: "오가닉" },
      { pattern: /노출|impressions/i, label: "노출" },
      { pattern: /CTR/i, label: "CTR" },
    ];

    for (const row of dataRows.slice(0, 15)) {
      const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const cellLabel = cells[0];
      const value = cells[1];

      for (const kw of keywords) {
        if (kw.pattern.test(cellLabel) && !keyMetrics.find((m) => m.label === kw.label)) {
          const change = cells.find((c) => /^[+(−-]/.test(c.trim()) && c !== value);
          const display = change ? `${value}(${change.trim()})` : value;
          keyMetrics.push({ label: kw.label, value: display });
          break;
        }
      }
      if (keyMetrics.length >= 4) break;
    }

    if (keyMetrics.length > 0) {
      return `📌 ${keyMetrics.map((m) => `*${m.label}* ${m.value}`).join(" · ")}`;
    }
  }

  // 테이블 없으면 "핵심 요약" 섹션 텍스트에서 추출
  const lines = reportMd.split("\n");
  let summaryStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,4}\s*\d*\.?\s*.*핵심\s*요약/i.test(lines[i])) {
      summaryStart = i;
      break;
    }
  }
  if (summaryStart >= 0) {
    const summaryLines = [];
    for (let i = summaryStart + 1; i < lines.length; i++) {
      if (/^#{1,2}\s/.test(lines[i])) break;
      const trimmed = lines[i].trim();
      if (trimmed && trimmed !== "---") summaryLines.push(trimmed);
    }
    if (summaryLines.length > 0) {
      return `📌 ${summaryLines.join("  ")}`;
    }
  }

  return null;
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
