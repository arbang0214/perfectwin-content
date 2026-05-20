#!/usr/bin/env node
/**
 * 누적 대시보드용 데이터 빌더
 *
 * data/monitoring/{YYYY-MM-DD}.json 일별 스냅샷을 모두 읽어,
 * dashboard/data.json 한 파일로 집계해 정적 HTML이 fetch한다.
 *
 * 매일 daily-report cron 끝에서 함께 호출되며, 결과 파일은 git에 커밋되어
 * GitHub Pages가 자동으로 서빙한다.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");
const OUT_FILE = path.join(__dirname, "..", "dashboard", "data.json");

function loadAllSnapshots() {
  if (!fs.existsSync(DATA_DIR)) return [];
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const snapshots = [];
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
      snapshots.push(data);
    } catch {
      /* 무시 */
    }
  }
  return snapshots;
}

function getGsc(snap, label) {
  return snap.gsc?.sites?.find((s) => s.label === label) || null;
}

function getInblog(snap, label) {
  return snap.inblog?.blogs?.find((b) => b.label === label) || null;
}

/**
 * 차트 1: 데모 신청 추세 (일별 + 누적)
 */
function buildDemoSeries(snapshots) {
  let cumulative = 0;
  return snapshots.map((s) => {
    const daily = s.demoFunnel?.summary?.submissions ?? 0;
    cumulative += daily;
    return { date: s.date, daily, cumulative };
  });
}

/**
 * 차트 2: 일별 트래픽 (홈페이지 + 영문/한글 블로그)
 */
function buildTrafficSeries(snapshots) {
  return snapshots.map((s) => {
    const home = s.ga4?.summary?.activeUsers ?? 0;
    const en = getInblog(s, "blog-en")?.traffic?.data?.[0]?.visits ?? 0;
    const ko = getInblog(s, "blog-ko")?.traffic?.data?.[0]?.visits ?? 0;
    return { date: s.date, home, blogEn: en, blogKo: ko };
  });
}

/**
 * 차트 3: GSC 추세 (블로그 영문 사이트 기준) — 클릭·노출·평균 순위
 * actualDate(GSC가 실제 데이터 가진 일자)로 x축을 잡아 lag 보정.
 */
function buildGscSeries(snapshots) {
  const map = {};
  for (const s of snapshots) {
    const site = getGsc(s, "blog.perfectwin.ai");
    if (!site || !site.totals) continue;
    const xDate = site.actualDate || s.date;
    if (!map[xDate]) map[xDate] = { date: xDate, clicks: 0, impressions: 0, positionSum: 0, count: 0 };
    map[xDate].clicks += site.totals.clicks;
    map[xDate].impressions += site.totals.impressions;
    map[xDate].positionSum += site.totals.position;
    map[xDate].count += 1;
  }
  return Object.values(map)
    .map((m) => ({
      date: m.date,
      clicks: m.clicks,
      impressions: m.impressions,
      avgPosition: m.count ? Math.round((m.positionSum / m.count) * 10) / 10 : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 차트 4: Top 포스트 누적 ranking — inblog posts의 누적 visits Top 10
 * (영문+한글 합쳐서)
 */
function buildTopPosts(snapshots) {
  const postMap = {};
  for (const s of snapshots) {
    for (const blogLabel of ["blog-en", "blog-ko"]) {
      const blog = getInblog(s, blogLabel);
      if (!blog) continue;
      const posts = blog.traffic?.data?.[0]?.posts || [];
      for (const p of posts) {
        const key = `${blogLabel}|${p.slug || p.post_id}`;
        if (!postMap[key]) {
          postMap[key] = {
            slug: p.slug,
            postId: p.post_id,
            title: p.title || p.slug,
            blog: blogLabel,
            visits: 0,
            clicks: 0,
            organic: 0,
          };
        }
        postMap[key].visits += p.visits || 0;
        postMap[key].clicks += p.clicks || 0;
        postMap[key].organic += p.organic || 0;
      }
    }
  }
  return Object.values(postMap)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);
}

/**
 * 헤더 KPI 카드용 누적 지표
 */
function buildKpiSummary(demoSeries, trafficSeries, topPosts) {
  const totalSubmissions = demoSeries.reduce((s, d) => s + d.daily, 0);

  // 최근 7일 평균 트래픽
  const last7 = trafficSeries.slice(-7);
  const avgRecentHomeTraffic = last7.length
    ? Math.round((last7.reduce((s, t) => s + t.home, 0) / last7.length) * 10) / 10
    : 0;
  const avgRecentBlogTraffic = last7.length
    ? Math.round((last7.reduce((s, t) => s + t.blogEn + t.blogKo, 0) / last7.length) * 10) / 10
    : 0;

  const trackedPosts = topPosts.length;

  return {
    totalSubmissions,
    avgRecentHomeTraffic,
    avgRecentBlogTraffic,
    trackedPosts,
  };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const snapshots = loadAllSnapshots();
  if (snapshots.length === 0) {
    console.log("[dashboard] 스냅샷 없음 — 빌드 건너뜀");
    return;
  }

  const demoSeries = buildDemoSeries(snapshots);
  const trafficSeries = buildTrafficSeries(snapshots);
  const gscSeries = buildGscSeries(snapshots);
  const topPosts = buildTopPosts(snapshots);
  const kpi = buildKpiSummary(demoSeries, trafficSeries, topPosts);

  const out = {
    generatedAt: new Date().toISOString(),
    range: {
      from: snapshots[0].date,
      to: snapshots[snapshots.length - 1].date,
      days: snapshots.length,
    },
    kpi,
    charts: {
      demo: demoSeries,
      traffic: trafficSeries,
      gsc: gscSeries,
      topPosts,
    },
  };

  ensureDir(path.dirname(OUT_FILE));
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");
  console.log(`[dashboard] 빌드 완료 — ${OUT_FILE} (${snapshots.length}일 집계)`);
}

if (require.main === module) main();

module.exports = { main };
