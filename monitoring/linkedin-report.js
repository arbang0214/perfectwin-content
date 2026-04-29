/**
 * LinkedIn → 블로그 유입 리포트
 * inblog 포스트별 referrer 데이터에서 LinkedIn 유입을 집계하여 Slack으로 발송한다.
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

  const results = [];
  for (const p of allPosts) {
    const src = await apiRequest(
      `/blogs/analytics/posts/${p.id}/sources?start_date=2025-01-01&end_date=${new Date().toISOString().split("T")[0]}&limit=50`,
      apiKey
    );
    if (src.body?.data) {
      const li = src.body.data.filter((s) => /linkedin/i.test(s.full_referrer));
      const totalVisits = src.body.data.reduce((s, x) => s + x.count, 0);
      const liTotal = li.reduce((s, x) => s + x.count, 0);
      if (liTotal > 0) {
        const app = li.filter((s) => /android|ios/i.test(s.full_referrer)).reduce((s, x) => s + x.count, 0);
        results.push({
          title: p.attributes.title,
          linkedin: liTotal,
          linkedinApp: app,
          linkedinWeb: liTotal - app,
          totalVisits,
        });
      }
    }
  }
  results.sort((a, b) => b.linkedin - a.linkedin);
  return {
    label,
    totalPosts: allPosts.length,
    results,
    grandTotal: results.reduce((s, r) => s + r.linkedin, 0),
  };
}

function buildTable(data) {
  const lines = [];
  let rank = 0;
  for (const r of data.results) {
    rank++;
    lines.push(`${rank}. *${r.title}*`);
    lines.push(`   LinkedIn ${r.linkedin}명 (앱 ${r.linkedinApp} · 웹 ${r.linkedinWeb}) | 전체 방문 ${r.totalVisits}명`);
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
  const en = await scanBlog(process.env.INBLOG_API_KEY, "영문 블로그", process.env.INBLOG_BLOG_URL);
  const ko = process.env.INBLOG_KO_API_KEY
    ? await scanBlog(process.env.INBLOG_KO_API_KEY, "한글 블로그", process.env.INBLOG_KO_BLOG_URL)
    : { label: "한글 블로그", totalPosts: 0, results: [], grandTotal: 0 };

  const totalAll = en.grandTotal + ko.grandTotal;
  const totalPosts = en.results.length + ko.results.length;

  const blocks = [
    { type: "header", text: { type: "plain_text", text: `📊 LinkedIn → 블로그 유입 리포트 — ${today}`, emoji: true } },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*기간:* 전체 누적 ~ ${today}\n*LinkedIn 총 유입:* ${totalAll}명 (${totalPosts}개 포스트)\n*영문:* ${en.grandTotal}명 (${en.results.length}/${en.totalPosts}개 포스트) | *한글:* ${ko.grandTotal}명 (${ko.results.length}/${ko.totalPosts}개 포스트)`,
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
    elements: [{ type: "mrkdwn", text: "📎 inblog referrer 기반 누적 집계 | com.linkedin.android + www.linkedin.com 합산" }],
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
