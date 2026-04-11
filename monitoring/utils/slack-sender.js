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

  console.error(`[Slack] ⚠️ SLACK_WEBHOOK_URL 미설정 — 요약 발송 불가! GitHub Secrets에 SLACK_WEBHOOK_URL을 확인하세요.`);
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
      body: JSON.stringify({ text: `${title}\n\n${slackSummary}`, blocks }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`전송 실패: ${res.status} ${body}`);
    }

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
      .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]+\s*/u, "")  // 이모지 제거
      .replace(/^\d+\.\s*/, "");                                                // 번호 제거

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

      // **→ 액션**: 추출 (같은 줄 또는 다음 줄 불릿)
      if (/\*?\*?→\s*액션\*?\*?\s*[::]\s*/.test(stripped)) {
        const content = stripped.replace(/\*?\*?→\s*액션\*?\*?\s*[::]\s*/, "").replace(/\*\*/g, "").trim();
        if (content) {
          actionLine = `→ 액션: ${content}`;
        } else {
          // 다음 줄 불릿에서 첫 번째 액션 항목을 수집하고, 나머지 액션 불릿은 건너뜀
          for (let k = j + 1; k < lines.length; k++) {
            const actionTrimmed = lines[k].trim();
            if (!actionTrimmed) { j = k; continue; }
            if (/^#{1,3}\s/.test(lines[k])) break;
            if (/^[-•*]\s/.test(actionTrimmed)) {
              if (!actionLine) {
                const actionContent = actionTrimmed.replace(/^[-•*]\s*/, "").replace(/\*\*/g, "").trim();
                if (actionContent) actionLine = `→ 액션: ${actionContent}`;
              }
              j = k; // 외부 j 루프를 전진시켜 액션 불릿이 일반 불릿으로 중복 추출되지 않도록 함
            } else {
              break;
            }
          }
        }
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
