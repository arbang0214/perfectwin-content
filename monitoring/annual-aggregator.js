/**
 * 연간 데이터 집계기
 * 일별 JSON 스냅샷을 월별로 집계하여 연간 리포트용 데이터를 생성한다.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data", "monitoring");

/**
 * 지정 기간의 일별 스냅샷을 모두 로드한다.
 */
function loadSnapshots(from, to) {
  const snapshots = [];
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    const dateStr = d.toISOString().split("T")[0];
    const file = path.join(DATA_DIR, `${dateStr}.json`);
    if (fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf-8"));
        snapshots.push(data);
      } catch { /* 무시 */ }
    }
    d.setDate(d.getDate() + 1);
  }
  return snapshots;
}

/**
 * 스냅샷을 월별로 그룹핑한다.
 */
function groupByMonth(snapshots) {
  const months = {};
  for (const snap of snapshots) {
    const month = snap.date.slice(0, 7); // YYYY-MM
    if (!months[month]) months[month] = [];
    months[month].push(snap);
  }
  return months;
}

/**
 * GA4 월별 집계
 */
function aggregateGA4Monthly(monthSnapshots) {
  const days = monthSnapshots.filter((s) => s.ga4?.summary);
  if (days.length === 0) return null;

  const sum = (field) => days.reduce((acc, d) => acc + (d.ga4.summary[field] || 0), 0);
  const avg = (field) => {
    const vals = days.map((d) => d.ga4.summary[field]).filter((v) => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;
  };

  // 채널별 집계
  const channelMap = {};
  for (const d of days) {
    for (const ch of (d.ga4.channels || [])) {
      if (!channelMap[ch.channel]) channelMap[ch.channel] = { sessions: 0, users: 0 };
      channelMap[ch.channel].sessions += ch.sessions;
      channelMap[ch.channel].users += ch.users;
    }
  }
  const channels = Object.entries(channelMap)
    .map(([channel, data]) => ({ channel, ...data }))
    .sort((a, b) => b.sessions - a.sessions);

  // 페이지별 집계
  const pageMap = {};
  for (const d of days) {
    for (const p of (d.ga4.topPages || [])) {
      if (!pageMap[p.pagePath]) pageMap[p.pagePath] = { pageViews: 0, users: 0, title: p.pageTitle };
      pageMap[p.pagePath].pageViews += p.pageViews;
      pageMap[p.pagePath].users += p.users;
    }
  }
  const topPages = Object.entries(pageMap)
    .map(([pagePath, data]) => ({ pagePath, ...data }))
    .sort((a, b) => b.pageViews - a.pageViews)
    .slice(0, 10);

  // 기기별 집계
  const deviceMap = {};
  for (const d of days) {
    for (const dev of (d.ga4.devices || [])) {
      if (!deviceMap[dev.device]) deviceMap[dev.device] = { sessions: 0, users: 0, pageViews: 0 };
      deviceMap[dev.device].sessions += dev.sessions;
      deviceMap[dev.device].users += dev.users;
      deviceMap[dev.device].pageViews += dev.pageViews;
    }
  }
  const devices = Object.entries(deviceMap)
    .map(([device, data]) => ({ device, ...data }))
    .sort((a, b) => b.sessions - a.sessions);

  // 국가별 집계
  const countryMap = {};
  for (const d of days) {
    for (const c of (d.ga4.countries || [])) {
      if (!countryMap[c.country]) countryMap[c.country] = { sessions: 0, users: 0 };
      countryMap[c.country].sessions += c.sessions;
      countryMap[c.country].users += c.users;
    }
  }
  const countries = Object.entries(countryMap)
    .map(([country, data]) => ({ country, ...data }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  // 소스/매체 집계
  const sourceMap = {};
  for (const d of days) {
    for (const sm of (d.ga4.sourceMedium || [])) {
      const key = `${sm.source}/${sm.medium}`;
      if (!sourceMap[key]) sourceMap[key] = { source: sm.source, medium: sm.medium, sessions: 0, users: 0 };
      sourceMap[key].sessions += sm.sessions;
      sourceMap[key].users += sm.users;
    }
  }
  const sourceMedium = Object.values(sourceMap).sort((a, b) => b.sessions - a.sessions).slice(0, 10);

  return {
    daysWithData: days.length,
    totals: {
      activeUsers: sum("activeUsers"),
      newUsers: sum("newUsers"),
      sessions: sum("sessions"),
      engagedSessions: sum("engagedSessions"),
      pageViews: sum("pageViews"),
      eventCount: sum("eventCount"),
    },
    averages: {
      bounceRate: avg("bounceRate"),
      engagementRate: avg("engagementRate"),
      avgSessionDuration: avg("avgSessionDuration"),
      pageViewsPerSession: avg("pageViewsPerSession"),
    },
    channels,
    topPages,
    devices,
    countries,
    sourceMedium,
  };
}

/**
 * GSC 월별 집계 (사이트별)
 */
function aggregateGSCMonthly(monthSnapshots) {
  const siteMap = {};

  for (const snap of monthSnapshots) {
    if (!snap.gsc?.sites) continue;
    for (const site of snap.gsc.sites) {
      if (!site.totals) continue;
      if (!siteMap[site.label]) {
        siteMap[site.label] = { clicks: 0, impressions: 0, positionSum: 0, positionCount: 0, daysWithData: 0, queryMap: {}, pageMap: {} };
      }
      const s = siteMap[site.label];
      s.clicks += site.totals.clicks;
      s.impressions += site.totals.impressions;
      s.positionSum += site.totals.position;
      s.positionCount++;
      s.daysWithData++;

      // 검색어 집계
      for (const q of (site.topQueries || [])) {
        if (!s.queryMap[q.query]) s.queryMap[q.query] = { clicks: 0, impressions: 0, positionSum: 0, count: 0 };
        s.queryMap[q.query].clicks += q.clicks;
        s.queryMap[q.query].impressions += q.impressions;
        s.queryMap[q.query].positionSum += q.position;
        s.queryMap[q.query].count++;
      }

      // 페이지 집계
      for (const p of (site.topPages || [])) {
        if (!s.pageMap[p.page]) s.pageMap[p.page] = { clicks: 0, impressions: 0, positionSum: 0, count: 0 };
        s.pageMap[p.page].clicks += p.clicks;
        s.pageMap[p.page].impressions += p.impressions;
        s.pageMap[p.page].positionSum += p.position;
        s.pageMap[p.page].count++;
      }
    }
  }

  const result = {};
  for (const [label, data] of Object.entries(siteMap)) {
    const avgPosition = data.positionCount ? Math.round((data.positionSum / data.positionCount) * 10) / 10 : null;
    const ctr = data.impressions ? Math.round((data.clicks / data.impressions) * 10000) / 100 : 0;

    const topQueries = Object.entries(data.queryMap)
      .map(([query, qd]) => ({
        query, clicks: qd.clicks, impressions: qd.impressions,
        avgPosition: Math.round((qd.positionSum / qd.count) * 10) / 10,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15);

    const topPages = Object.entries(data.pageMap)
      .map(([page, pd]) => ({
        page, clicks: pd.clicks, impressions: pd.impressions,
        avgPosition: Math.round((pd.positionSum / pd.count) * 10) / 10,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15);

    result[label] = {
      daysWithData: data.daysWithData,
      totals: { clicks: data.clicks, impressions: data.impressions, ctr, avgPosition },
      topQueries,
      topPages,
    };
  }
  return result;
}

/**
 * inblog 월별 집계 (블로그별)
 */
function aggregateInblogMonthly(monthSnapshots) {
  const blogMap = {};

  for (const snap of monthSnapshots) {
    if (!snap.inblog?.blogs) continue;
    for (const blog of snap.inblog.blogs) {
      const t = blog.traffic?.data?.[0];
      if (!t) continue;
      if (!blogMap[blog.label]) {
        blogMap[blog.label] = { visits: 0, clicks: 0, organic: 0, post: 0, home: 0, daysWithData: 0, sourceMap: {}, postMap: {} };
      }
      const b = blogMap[blog.label];
      b.visits += t.visits || 0;
      b.clicks += t.clicks || 0;
      b.organic += t.organic || 0;
      b.post += t.post || 0;
      b.home += t.home || 0;
      b.daysWithData++;

      // 소스 집계
      for (const src of (blog.sources?.data || [])) {
        if (!b.sourceMap[src.full_referrer]) b.sourceMap[src.full_referrer] = 0;
        b.sourceMap[src.full_referrer] += src.count;
      }

      // 포스트별 집계
      for (const p of (blog.posts?.data || [])) {
        const key = p.post_id ?? "null";
        if (!b.postMap[key]) b.postMap[key] = { post_id: p.post_id, title: p.title || null, visits: 0, clicks: 0, organic: 0 };
        b.postMap[key].visits += p.visits || 0;
        b.postMap[key].clicks += p.clicks || 0;
        b.postMap[key].organic += p.organic || 0;
        // 제목이 나중 스냅샷에서 채워질 수 있으므로 갱신
        if (p.title) b.postMap[key].title = p.title;
      }
    }
  }

  const result = {};
  for (const [label, data] of Object.entries(blogMap)) {
    const sources = Object.entries(data.sourceMap)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topPosts = Object.values(data.postMap)
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);

    result[label] = {
      daysWithData: data.daysWithData,
      totals: { visits: data.visits, clicks: data.clicks, organic: data.organic, post: data.post, home: data.home },
      sources,
      topPosts,
    };
  }
  return result;
}

/**
 * Demo Funnel 월별 집계 — submit/intent 합산 + 차원별 breakdown 합산
 */
function aggregateDemoFunnelMonthly(monthSnapshots) {
  const days = monthSnapshots.filter((s) => s.demoFunnel?.summary);
  if (days.length === 0) return null;

  const totals = {
    demoPageSessions: 0,
    demoPageUsers: 0,
    submissions: 0,
    submissionUsers: 0,
  };
  for (const d of days) {
    const s = d.demoFunnel.summary;
    totals.demoPageSessions += s.demoPageSessions || 0;
    totals.demoPageUsers += s.demoPageUsers || 0;
    totals.submissions += s.submissions || 0;
    totals.submissionUsers += s.submissionUsers || 0;
  }
  const conversionRate = totals.demoPageSessions > 0
    ? Math.round((totals.submissions / totals.demoPageSessions) * 10000) / 100
    : null;

  // 차원 합산 헬퍼: key 함수가 만든 그룹별로 sessions/users 합산
  function aggregateBreakdown(snapshots, getRows, keyFn, fields) {
    const map = {};
    for (const snap of snapshots) {
      const rows = getRows(snap) || [];
      for (const r of rows) {
        const key = keyFn(r);
        if (!map[key]) {
          map[key] = { sessions: 0, users: 0 };
          for (const f of fields) map[key][f] = r[f];
        }
        map[key].sessions += r.sessions || 0;
        map[key].users += r.users || 0;
      }
    }
    return Object.values(map).sort((a, b) => b.sessions - a.sessions);
  }

  const submitBySourceMedium = aggregateBreakdown(
    days,
    (s) => s.demoFunnel?.submit?.bySourceMedium,
    (r) => `${r.sessionSource}/${r.sessionMedium}`,
    ["sessionSource", "sessionMedium"],
  );

  const submitByCampaign = aggregateBreakdown(
    days,
    (s) => s.demoFunnel?.submit?.byCampaign,
    (r) => `${r.sessionCampaignName}|${r.sessionSource}|${r.sessionMedium}`,
    ["sessionCampaignName", "sessionSource", "sessionMedium"],
  );

  const submitByLandingPage = aggregateBreakdown(
    days,
    (s) => s.demoFunnel?.submit?.byLandingPage,
    (r) => r.landingPagePlusQueryString,
    ["landingPagePlusQueryString"],
  ).slice(0, 25);

  const submitByFirstUserSource = aggregateBreakdown(
    days,
    (s) => s.demoFunnel?.submit?.byFirstUserSource,
    (r) => `${r.firstUserSource}/${r.firstUserMedium}`,
    ["firstUserSource", "firstUserMedium"],
  );

  const intentByLandingPage = aggregateBreakdown(
    days,
    (s) => s.demoFunnel?.intent?.byLandingPage,
    (r) => r.landingPagePlusQueryString,
    ["landingPagePlusQueryString"],
  ).slice(0, 25);

  return {
    daysWithData: days.length,
    totals: { ...totals, conversionRate },
    submit: {
      bySourceMedium: submitBySourceMedium,
      byCampaign: submitByCampaign,
      byLandingPage: submitByLandingPage,
      byFirstUserSource: submitByFirstUserSource,
    },
    intent: {
      byLandingPage: intentByLandingPage,
    },
  };
}

/**
 * Content Funnel 월별 집계 — UTM 캠페인별 행동·전환 합산
 * 같은 source/medium/campaign/content 키로 합산하되,
 * 메트릭 중 가중평균이 필요한 것(체류·페이지/세션·참여율)은 세션 가중평균.
 */
function aggregateContentFunnelMonthly(monthSnapshots) {
  const days = monthSnapshots.filter((s) => s.contentFunnel?.campaigns?.length);
  if (days.length === 0) return null;

  const map = {};
  for (const snap of days) {
    for (const c of snap.contentFunnel.campaigns) {
      const key = `${c.source}|${c.medium}|${c.campaign}|${c.content}`;
      if (!map[key]) {
        map[key] = {
          source: c.source, medium: c.medium, campaign: c.campaign, content: c.content,
          sessions: 0, users: 0, pageViews: 0,
          weightedDurationSum: 0, weightedEngagementSum: 0, weightedPvpsSum: 0,
          demoIntentSessions: 0, demoCompleteSessions: 0,
          topPageMap: {},
        };
      }
      const m = map[key];
      m.sessions += c.sessions;
      m.users += c.users;
      m.pageViews += c.pageViews;
      m.weightedDurationSum += (c.avgSessionDuration || 0) * c.sessions;
      m.weightedEngagementSum += (c.engagementRate || 0) * c.sessions;
      m.weightedPvpsSum += (c.pageViewsPerSession || 0) * c.sessions;
      m.demoIntentSessions += c.demoIntentSessions || 0;
      m.demoCompleteSessions += c.demoCompleteSessions || 0;
      for (const p of (c.topPages || [])) {
        m.topPageMap[p.page] = (m.topPageMap[p.page] || 0) + p.views;
      }
    }
  }

  const campaigns = Object.values(map).map((m) => {
    const topPages = Object.entries(m.topPageMap)
      .map(([page, views]) => ({ page, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);
    return {
      source: m.source, medium: m.medium, campaign: m.campaign, content: m.content,
      sessions: m.sessions, users: m.users, pageViews: m.pageViews,
      avgSessionDuration: m.sessions > 0
        ? Math.round((m.weightedDurationSum / m.sessions) * 10) / 10 : 0,
      engagementRate: m.sessions > 0
        ? Math.round((m.weightedEngagementSum / m.sessions) * 100) / 100 : 0,
      pageViewsPerSession: m.sessions > 0
        ? Math.round((m.weightedPvpsSum / m.sessions) * 100) / 100 : 0,
      demoIntentSessions: m.demoIntentSessions,
      demoCompleteSessions: m.demoCompleteSessions,
      demoIntentRate: m.sessions > 0
        ? Math.round((m.demoIntentSessions / m.sessions) * 10000) / 100 : 0,
      demoCompleteRate: m.sessions > 0
        ? Math.round((m.demoCompleteSessions / m.sessions) * 10000) / 100 : 0,
      topPages,
    };
  }).sort((a, b) => b.sessions - a.sessions);

  const totalSessions = campaigns.reduce((s, c) => s + c.sessions, 0);
  const totalDemoIntent = campaigns.reduce((s, c) => s + c.demoIntentSessions, 0);
  const totalDemoComplete = campaigns.reduce((s, c) => s + c.demoCompleteSessions, 0);

  return {
    daysWithData: days.length,
    summary: {
      campaignCount: campaigns.length,
      totalSessions,
      totalDemoIntent,
      totalDemoComplete,
      overallDemoIntentRate: totalSessions > 0
        ? Math.round((totalDemoIntent / totalSessions) * 10000) / 100 : 0,
      overallDemoCompleteRate: totalSessions > 0
        ? Math.round((totalDemoComplete / totalSessions) * 10000) / 100 : 0,
    },
    campaigns,
  };
}

/**
 * 요일별 패턴 분석
 */
function analyzeDayOfWeekPattern(snapshots) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const dayStats = days.map(() => ({ sessions: 0, users: 0, pageViews: 0, count: 0 }));

  for (const snap of snapshots) {
    if (!snap.ga4?.summary) continue;
    const dow = new Date(snap.date).getDay();
    dayStats[dow].sessions += snap.ga4.summary.sessions;
    dayStats[dow].users += snap.ga4.summary.activeUsers;
    dayStats[dow].pageViews += snap.ga4.summary.pageViews;
    dayStats[dow].count++;
  }

  return days.map((name, i) => ({
    day: name,
    avgSessions: dayStats[i].count ? Math.round(dayStats[i].sessions / dayStats[i].count * 10) / 10 : 0,
    avgUsers: dayStats[i].count ? Math.round(dayStats[i].users / dayStats[i].count * 10) / 10 : 0,
    avgPageViews: dayStats[i].count ? Math.round(dayStats[i].pageViews / dayStats[i].count * 10) / 10 : 0,
    dataPoints: dayStats[i].count,
  }));
}

/**
 * 전체 연간 집계를 수행한다.
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @returns {Object} 연간 집계 데이터
 */
function aggregateAnnual(from, to) {
  console.log(`  데이터 로드: ${from} ~ ${to}`);
  const snapshots = loadSnapshots(from, to);
  console.log(`  로드된 스냅샷: ${snapshots.length}일`);

  if (snapshots.length === 0) {
    throw new Error("집계할 데이터가 없습니다. 먼저 backfill.js로 데이터를 수집하세요.");
  }

  const monthlyGroups = groupByMonth(snapshots);
  const months = Object.keys(monthlyGroups).sort();

  console.log(`  월별 집계: ${months.length}개월`);

  const monthly = {};
  for (const month of months) {
    const snaps = monthlyGroups[month];
    monthly[month] = {
      ga4: aggregateGA4Monthly(snaps),
      gsc: aggregateGSCMonthly(snaps),
      inblog: aggregateInblogMonthly(snaps),
      demoFunnel: aggregateDemoFunnelMonthly(snaps),
      contentFunnel: aggregateContentFunnelMonthly(snaps),
    };
  }

  // 연간 전체 집계
  const annualGA4 = aggregateGA4Monthly(snapshots);
  const annualGSC = aggregateGSCMonthly(snapshots);
  const annualInblog = aggregateInblogMonthly(snapshots);
  const annualDemoFunnel = aggregateDemoFunnelMonthly(snapshots);
  const annualContentFunnel = aggregateContentFunnelMonthly(snapshots);
  const dayOfWeek = analyzeDayOfWeekPattern(snapshots);

  return {
    period: { from, to },
    totalDays: snapshots.length,
    months: months,
    monthly,
    annual: {
      ga4: annualGA4,
      gsc: annualGSC,
      inblog: annualInblog,
      demoFunnel: annualDemoFunnel,
      contentFunnel: annualContentFunnel,
      dayOfWeek,
    },
  };
}

module.exports = { aggregateAnnual };
