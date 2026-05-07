/**
 * LinkedIn → 블로그 유입 리포트
 * inblog 포스트별 referrer 데이터에서 LinkedIn 유입을 집계하여 Slack으로 발송한다.
 * 어제 하루치 + 전체 누적을 병행 표시한다.
 */

const https = require("https");

function apiRequest(path, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "inblog.ai",
        path: `/api/v1${path}`,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

/**
 * KST 기준 어제 날짜 (YYYY-MM-DD).
 */
function getKstYesterday() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setDate(kst.getDate() - 1);
  return kst.toISOString().split("T")[0];
}

/**
 * sources 응답에서 LinkedIn 유입을 집계한다.
 */
function summarizeLinkedIn(sourcesData) {
  const data = sourcesData || [];
  const li = data.filter((s) => /linkedin/i.test(s.full_referrer));
  const total = li.reduce((s, x) => s + x.count, 0);
  const app = li.filter((s) => /android|ios/i.test(s.full_referrer)).reduce((s, x) => s + x.count, 0);
  const totalVisits = data.reduce((s, x) => s + x.count, 0);
  return { total, app, web: total - app, totalVisits };
}

async function scanBlog(apiKey, label, blogUrl) {
  let allPosts = [];
  let page = 1;
  while (true) {
    const res = await apiRequest(`/posts?limit=100&page=${page}`, apiKey);
    if (!res.body?.data?.length) break;
    allPosts = allPosts.concat(res.body.data);
    if (page >= (res.body.meta?.totalPages || 1)) break;
    page++;
  }

  const today = new Date().toISOString().split("T")[0];
  const yesterday = getKstYesterday();

  const results = [];
  for (const p of allPosts) {
    // 누적 (2025-01-01 ~ 오늘)
    const srcCum = await apiRequest(
      `/blogs/analytics/posts/${p.id}/sources?start_date=2025-01-01&end_date=${today}&limit=50`,
      apiKey
    );
    // 어제 하루
    const srcDaily = await apiRequest(
      `/blogs/analytics/posts/${p.id}/sources?start_date=${yesterday}&end_date=${yesterday}&limit=50`,
      apiKey
    );

    const cum = summarizeLinkedIn(srcCum.body?.data);
    const daily = summarizeLinkedIn(srcDaily.body?.data);

    // 누적이라도 LinkedIn 유입이 한 번이라도 있었던 포스트만 표시
    if (cum.total > 0) {
      results.push({
        title: p.attributes.title,
        cumLi: cum.total,
        cumLiApp: cum.app,
        cumLiWeb: cum.web,
        cumTotal: cum.totalVisits,
        dailyLi: daily.total,
        dailyLiApp: daily.app,
        dailyLiWeb: daily.web,
      });
    }
  }

  // 어제 유입 큰 순 → 누적 큰 순 (어제 0인 포스트는 누적 순으로)
  results.sort((a, b) => b.dailyLi - a.dailyLi || b.cumLi - a.cumLi);

  return {
    label,
    totalPosts: allPosts.length,
    results,
    grandCum: results.reduce((s, r) => s + r.cumLi, 0),
    grandDaily: results.reduce((s, r) => s + r.dailyLi, 0),
    activeYesterday: results.filter((r) => r.dailyLi > 0).length,
  };
}

function buildTable(data) {
  const lines = [];
  let rank = 0;
  for (const r of data.results) {
    rank++;
    const dailyMarker = r.dailyLi > 0 ? `🆕 ` : "";
    lines.push(`${rank}. ${dailyMarker}*${r.title}*`);
    lines.push(
      `   어제 ${r.dailyLi}명 (앱 ${r.dailyLiApp} · 웹 ${r.dailyLiWeb}) | 누적 ${r.cumLi}명 (앱 ${r.cumLiApp} · 웹 ${r.cumLiWeb}) | 전체 방문 ${r.cumTotal}명`
    );
  }
  return lines.join("\n");
}

async function generateLinkedInReport() {
  const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
  if (!WEBHOOK) {
    console.log("[LinkedIn 리포트] SLACK_WEBHOOK_URL 미설정 — 건너뜀");
    return;
  }
  if (!process.env.INBLOG_API_KEY) {
    console.log("[LinkedIn 리포트] INBLOG_API_KEY 미설정 — 건너뜀");
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const yesterday = getKstYesterday();
  const en = await scanBlog(process.env.INBLOG_API_KEY, "영문 블로그", process.env.INBLOG_BLOG_URL);
  const ko = process.env.INBLOG_KO_API_KEY
    ? await scanBlog(process.env.INBLOG_KO_API_KEY, "한글 블로그", process.env.INBLOG_KO_BLOG_URL)
    : { label: "한글 블로그", totalPosts: 0, results: [], grandCum: 0, grandDaily: 0, activeYesterday: 0 };

  const totalCum = en.grandCum + ko.grandCum;
  const totalDaily = en.grandDaily + ko.grandDaily;
  const activeYesterday = en.activeYesterday + ko.activeYesterday;
  const totalPostsWithLi = en.results.length + ko.results.length;

  const blocks = [
    { type: "header", text: { type: "plain_text", text: `📊 LinkedIn → 블로그 유입 리포트 — ${today}`, emoji: true } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*어제 (${yesterday}) LinkedIn 유입:* ${totalDaily}명 (${activeYesterday}개 포스트)\n` +
          `*전체 누적 LinkedIn 유입:* ${totalCum}명 (${totalPostsWithLi}개 포스트)\n` +
          `*영문 블로그:* 어제 ${en.grandDaily} / 누적 ${en.grandCum}명 (${en.results.length}/${en.totalPosts}개 포스트)\n` +
          `*한글 블로그:* 어제 ${ko.grandDaily} / 누적 ${ko.grandCum}명 (${ko.results.length}/${ko.totalPosts}개 포스트)`,
      },
    },
    { type: "divider" },
  ];

  if (en.results.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🇺🇸 영문 블로그 — LinkedIn 유입 Top ${en.results.length}*\n\n${buildTable(en)}` },
    });
    blocks.push({ type: "divider" });
  }

  if (ko.results.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🇰🇷 한글 블로그 — LinkedIn 유입 Top ${ko.results.length}*\n\n${buildTable(ko)}` },
    });
    blocks.push({ type: "divider" });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          "📎 inblog referrer 기반 | com.linkedin.android + www.linkedin.com 합산 | 🆕 = 어제 신규 유입 발생 포스트",
      },
    ],
  });

  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });

  if (!res.ok) {
    throw new Error(`Slack 전송 실패: ${res.status}`);
  }
  console.log("  ✅ LinkedIn 유입 리포트 Slack 발송 완료");
}

module.exports = { generateLinkedInReport };
