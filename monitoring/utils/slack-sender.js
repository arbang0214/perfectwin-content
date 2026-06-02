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

  const insightCount = label === "daily" ? 6 : 8;
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

  // ── 1. 지표 요약 1줄 ──
  const metricsLine = extractMetricsOneLiner(reportMd);

  // ── 2. 인사이트 블록 추출 (제목 + 핵심 불릿 + 액션) ──
  let insightStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#{2,4}\s*\d*\.?\s*.*인사이트/i.test(lines[i])) {
      insightStart = i;
      break;
    }
  }

  let insightText = "";
  if (insightStart >= 0) {
    const insightBlocks = extractInsightBlocks(lines, insightStart, insightCount);
    if (insightBlocks.length > 0) {
      insightText = insightBlocks.join("\n\n");
    }
  }

  const parts = [];
  if (metricsLine) parts.push(metricsLine);
  if (insightText) parts.push(insightText);

  return parts.join("\n\n") || lines.slice(0, 8).join("\n").trim();
}

/**
 * 인사이트 섹션에서 각 인사이트의 제목 + 핵심 불릿 + 액션을 추출한다.
 * 출력 형식: 🔴/🟡/🟢 N. 제목 + 불릿 + → 액션
 */
function extractInsightBlocks(lines, insightStart, maxCount) {
  const blocks = [];
  let insightNum = 0;

  for (let i = insightStart + 1; i < lines.length; i++) {
    // 인사이트 섹션 종료 (## 이상의 다른 섹션)
    if (/^#{1,2}\s/.test(lines[i]) && !/인사이트/i.test(lines[i])) break;

    // ### 인사이트 제목 감지
    const titleMatch = lines[i].match(/^###\s*(.+)/);
    if (!titleMatch) continue;
    if (insightNum >= maxCount) break;
    insightNum++;

    // 제목 정리 (이모지·볼드·번호 제거 후 severity 판정)
    const rawTitle = titleMatch[1].replace(/\*\*/g, "").trim();
    const severity = getSeverity(rawTitle);
    const cleanTitle = rawTitle
      .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/gu, "")  // 이모지 제거 (유니코드 안전)
      .replace(/^\d+\.\s*/, "");                         // 번호 제거

    // 제목 아래에서 핵심 내용 추출
    const bullets = [];
    let actionLine = "";

    for (let j = i + 1; j < lines.length; j++) {
      // 다음 인사이트 또는 섹션이면 중단
      if (/^#{1,3}\s/.test(lines[j])) break;

      const trimmed = lines[j].trim();
      if (!trimmed) continue;

      // 불릿 접두사 제거한 버전으로 패턴 매칭
      const stripped = trimmed.replace(/^[-•*]\s*/, "");

      // **현상**: ... 에서 핵심 데이터만 추출
      if (/\*?\*?현상\*?\*?\s*[::]\s*/.test(stripped)) {
        const content = stripped.replace(/\*?\*?현상\*?\*?\s*[::]\s*/, "").trim();
        if (content) bullets.push(`• ${content}`);
        continue;
      }

      // **→ 액션**: 추출
      if (/\*?\*?→\s*액션\*?\*?\s*[::]\s*/.test(stripped)) {
        const content = stripped.replace(/\*?\*?→\s*액션\*?\*?\s*[::]\s*/, "").replace(/\*\*/g, "").trim();
        if (content) actionLine = `→ 액션: ${content}`;
        continue;
      }

      // **왜 이런 일이 생겼나** → Slack 요약에서는 생략
      if (/\*?\*?왜\s/.test(stripped)) {
        continue;
      }

      // **비즈니스 임팩트** → Slack 요약에서는 생략
      if (/\*?\*?비즈니스\s*임팩트/i.test(stripped)) {
        continue;
      }

      // 일반 불릿 포인트 (기존 짧은 형식 인사이트 대응)
      if (/^[-•]\s/.test(trimmed) && bullets.length < 3) {
        const bulletContent = stripped.replace(/\*\*/g, "").trim();
        if (bulletContent && bulletContent.length < 150) {
          bullets.push(`• ${bulletContent}`);
        }
      }
    }

    // 블록 조립
    let block = `${severity} ${insightNum}. ${cleanTitle}`;
    if (bullets.length > 0) block += "\n" + bullets.join("\n");
    if (actionLine) block += "\n" + actionLine;

    blocks.push(block);
  }

  return blocks;
}

/**
 * 인사이트 제목에서 심각도를 판정한다.
 * 🔴 심각/긴급, 🟡 주의/기회, 🟢 긍정/개선
 */
function getSeverity(title) {
  if (/🚨|심각|급감|급락|붕괴|차단|실패|단절|위험|긴급|봇|방치/.test(title)) return "🔴";
  if (/🟢|개선|증가|상승|긍정|성과|효과|잠재력|기회.*긍정/.test(title)) return "🟢";
  return "🟡";
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
      { pattern: /평균.*포지션|position/i, label: "평균 포지션" },
      { pattern: /이탈률|bounceRate|bounce/i, label: "이탈률" },
    ];

    for (const row of dataRows.slice(0, 20)) {
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
      if (keyMetrics.length >= 7) break;
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
 * 문자열의 시각적 너비 계산 (CJK·이모지는 2칸).
 */
function visualWidth(s) {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code < 0x80) {
      w += 1;
    } else if (
      (code >= 0x1100 && code <= 0x115F) ||
      (code >= 0x2E80 && code <= 0x9FFF) ||
      (code >= 0xA000 && code <= 0xA4CF) ||
      (code >= 0xAC00 && code <= 0xD7A3) ||
      (code >= 0xF900 && code <= 0xFAFF) ||
      (code >= 0xFE30 && code <= 0xFE4F) ||
      (code >= 0xFF00 && code <= 0xFF60) ||
      (code >= 0xFFE0 && code <= 0xFFE6) ||
      code >= 0x1F000
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function padVisual(s, width) {
  const w = visualWidth(s);
  if (w >= width) return s;
  return s + " ".repeat(width - w);
}

function truncateVisual(s, maxWidth) {
  if (visualWidth(s) <= maxWidth) return s;
  let w = 0;
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0);
    const cw =
      code < 0x80
        ? 1
        : (code >= 0x1100 && code <= 0x115F) ||
          (code >= 0x2E80 && code <= 0x9FFF) ||
          (code >= 0xAC00 && code <= 0xD7A3) ||
          code >= 0x1F000
          ? 2
          : 1;
    if (w + cw > maxWidth - 1) {
      out += "…";
      break;
    }
    out += ch;
    w += cw;
  }
  return out;
}

/**
 * 마크다운 표를 슬랙 친화 포맷으로 변환.
 *   - 컬럼 ≤4: 키-값 불릿 (마지막 컬럼이 의미/해석이면 ↳ 부속 줄)
 *   - 컬럼 ≥5: CJK 인식 컬럼 패딩 + 코드 블록
 */
function renderTable(header, body) {
  const splitRow = (s) => {
    const parts = s.split("|");
    if (parts.length && parts[0].trim() === "") parts.shift();
    if (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
    return parts.map((c) => c.trim());
  };
  const cleanCell = (s) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/```/g, "");

  const headers = splitRow(header).map(cleanCell);
  const rows = body
    .trim()
    .split("\n")
    .map((line) => splitRow(line).map(cleanCell))
    .filter((row) => row.length > 0 && row.some(Boolean));

  if (headers.length === 0 || rows.length === 0) return "";

  if (headers.length <= 4) return tableToBullets(headers, rows);
  return tableToAlignedCode(headers, rows);
}

function tableToBullets(headers, rows) {
  const lastHeader = headers[headers.length - 1] || "";
  const isLastMeaning = /의미|해석|설명/.test(lastHeader);
  const firstIsNumber = /^(#|번호)$/.test(headers[0] || "");
  const GENERIC = /^(오늘|값|어제|전일|이번주|지난주)$/;

  let out = "";
  rows.forEach((row, idx) => {
    const keyIdx = firstIsNumber ? 1 : 0;
    const valStart = keyIdx + 1;
    const valEnd = isLastMeaning ? row.length - 1 : row.length;

    const key = row[keyIdx] || "";
    const valueCells = [];
    for (let i = valStart; i < valEnd; i++) {
      const v = row[i];
      const h = headers[i] || "";
      if (!v) continue;
      if (h && !GENERIC.test(h) && visualWidth(h) <= 14) {
        valueCells.push(`${h} ${v}`);
      } else {
        valueCells.push(v);
      }
    }
    const meta = isLastMeaning ? row[row.length - 1] || "" : "";

    const prefix = firstIsNumber ? `${idx + 1}.` : "•";
    let line = `${prefix} *${key}*`;
    if (valueCells.length === 1) line += `: ${valueCells[0]}`;
    else if (valueCells.length > 1) line += ` — ${valueCells.join(" · ")}`;
    out += line + "\n";
    if (meta && meta !== "—") out += `  ↳ ${meta}\n`;
  });
  return out + "\n";
}

function tableToAlignedCode(headers, rows) {
  // 마지막 컬럼이 "해석/의미/설명"이면 표에서 빼고 행 번호로 매핑된 부속 줄로 출력
  const lastHeader = headers[headers.length - 1] || "";
  const hasMeaning = /의미|해석|설명/.test(lastHeader) && headers.length >= 3;

  const tableHeaders = hasMeaning ? headers.slice(0, -1) : headers;
  const colCount = tableHeaders.length;
  const MAX_COL = colCount >= 6 ? 16 : 22;

  // 첫 컬럼(키워드·캠페인·페이지 등 식별자)은 truncate하지 않고 데이터 max 그대로.
  // 나머지 컬럼은 MAX_COL로 cap.
  const colWidths = [];
  for (let c = 0; c < colCount; c++) {
    let max = visualWidth(tableHeaders[c] || "");
    for (const r of rows) {
      const w = visualWidth(r[c] || "");
      if (w > max) max = w;
    }
    colWidths.push(c === 0 ? max : Math.min(max, MAX_COL));
  }

  const formatRow = (cells) =>
    cells
      .slice(0, colCount)
      .map((cell, i) => padVisual(truncateVisual(cell || "", colWidths[i]), colWidths[i]))
      .join("  ");

  let out = "```\n";
  out += formatRow(tableHeaders) + "\n";
  out += colWidths.map((w) => "─".repeat(w)).join("──") + "\n";
  rows.forEach((row) => {
    out += formatRow(row) + "\n";
  });
  out += "```\n";

  if (hasMeaning) {
    rows.forEach((row, idx) => {
      const meaning = row[row.length - 1];
      if (meaning && meaning !== "—") {
        out += `↳ *${idx + 1}.* ${meaning}\n`;
      }
    });
    out += "\n";
  }
  return out;
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

  // 마크다운 링크 [text](url) → Slack mrkdwn <url|text>
  // (표 변환 전에 처리해야 표 안 링크도 변환됨)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "<$2|$1>");

  // 테이블을 슬랙 친화 포맷으로 변환 (컬럼 수에 따라 불릿/정렬 코드블록)
  text = text.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/g, (_, header, body) =>
    renderTable(header, body)
  );

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

/**
 * 통합 일간 리포트 — 단일 메시지로 발송.
 * 전체 마크다운(헤드라인 포함)을 한 메시지의 multiple blocks로 묶어서 전송.
 * BOT_TOKEN+CHANNEL_ID 우선, webhook fallback.
 * @param {Object} args
 * @param {string} args.title  메시지 제목 (header block)
 * @param {string} args.body   리포트 본문 전체 (마크다운)
 * @returns {boolean}
 */
async function sendUnifiedDailyToSlack({ title, body }) {
  const bodyMrkdwn = convertToSlackMrkdwn(body);

  if (BOT_TOKEN && CHANNEL_ID) {
    const ok = await sendSingleViaBot(title, bodyMrkdwn);
    if (ok) return true;
    if (WEBHOOK_URL) {
      console.log("[Slack] Bot 단일 메시지 실패 — webhook으로 fallback");
    }
    // fall through to webhook
  }
  if (WEBHOOK_URL) {
    const ok = await sendSingleViaWebhook(title, bodyMrkdwn);
    if (ok) return true;
  }

  // 무음 실패 차단: 발송 수단이 없거나 전부 실패 → 워크플로 fail로 노출
  throw new Error("Slack 발송 실패 — Bot/Webhook 모두 실패 또는 미설정");
}

/**
 * 단일 메시지의 blocks 배열을 구성한다.
 * Slack section 블록은 mrkdwn 3000자 제한 → 청크 분할.
 * blocks 배열 최대 50개 → 48개 청크까지 안전 마진.
 */
function buildSingleMessageBlocks(title, bodyMrkdwn) {
  const chunks = splitIntoChunks(bodyMrkdwn, 2900);
  return [
    { type: "header", text: { type: "plain_text", text: title, emoji: true } },
    ...chunks.slice(0, 48).map((chunk) => ({
      type: "section",
      text: { type: "mrkdwn", text: chunk },
    })),
  ];
}

async function sendSingleViaBot(title, bodyMrkdwn) {
  try {
    const blocks = buildSingleMessageBlocks(title, bodyMrkdwn);
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: CHANNEL_ID, text: title, blocks, mrkdwn: true }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    console.log(`[Slack] 통합 리포트 단일 메시지 전송 성공 (${blocks.length - 1}개 섹션)`);
    return true;
  } catch (err) {
    console.error(`[Slack] Bot 단일 메시지 전송 실패: ${err.message}`);
    return false;
  }
}

async function sendSingleViaWebhook(title, bodyMrkdwn) {
  try {
    const blocks = buildSingleMessageBlocks(title, bodyMrkdwn);
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    if (!res.ok) throw new Error(`전송 실패: ${res.status}`);
    console.log(`[Slack] 통합 리포트 단일 메시지 전송 성공 (${blocks.length - 1}개 섹션)`);
    return true;
  } catch (err) {
    console.error(`[Slack] Webhook 단일 메시지 전송 실패: ${err.message}`);
    return false;
  }
}

module.exports = { sendToSlack, sendReportToSlack, sendUnifiedDailyToSlack };
