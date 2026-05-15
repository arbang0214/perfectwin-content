/**
 * Content Funnel 데이터 수집기
 *
 * UTM이 박힌 세션(=콘텐츠가 유도한 트래픽)의 행동·전환 데이터를 캠페인별로 집계.
 * 사용자 시나리오:
 *   - 어느 블로그가 어느 페이지로 보냈는지 (Source/Medium/Campaign/Content)
 *   - 그 트래픽이 얼마나 머물고 몇 페이지 봤는지 (체류·참여율·페이지/세션)
 *   - 데모 페이지 진입 / 완료까지 갔는지 (퍼널)
 *   - 그 세션이 더 본 페이지가 무엇인지 (Top 페이지)
 *
 * 데이터 원천: GA4 Data API. sessionCampaignName이 비어있지 않은 세션만.
 */

const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const { KEY_FILE } = require("../utils/google-auth");

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "494841765";
const DEMO_PATH = "/contact-us/request-demo";
const THANKYOU_PATH = "/contact-us/thankyou";

function createClient() {
  return new BetaAnalyticsDataClient({
    keyFilename: require("path").resolve(KEY_FILE),
  });
}

async function runReport(client, opts) {
  const [response] = await client.runReport({
    property: `properties/${PROPERTY_ID}`,
    ...opts,
  });
  return response;
}

/** UTM 박힌 세션만 추출하는 필터 (sessionCampaignName이 "(not set)"이 아닌 것) */
function utmTrafficFilter() {
  return {
    notExpression: {
      filter: {
        fieldName: "sessionCampaignName",
        stringFilter: { matchType: "EXACT", value: "(not set)" },
      },
    },
  };
}

/** UTM 박힌 세션을 캠페인 4종 차원으로 묶어 행동 메트릭 집계 */
async function getBehaviorByCampaign(client, date) {
  const res = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
      { name: "sessionManualAdContent" }, // utm_content
    ],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "screenPageViews" },
      { name: "screenPageViewsPerSession" },
      { name: "averageSessionDuration" },
      { name: "engagementRate" },
    ],
    dimensionFilter: utmTrafficFilter(),
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 50,
  });

  if (!res.rows) return [];
  return res.rows.map((row) => ({
    source: row.dimensionValues[0].value,
    medium: row.dimensionValues[1].value,
    campaign: row.dimensionValues[2].value,
    content: row.dimensionValues[3].value,
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    pageViews: Number(row.metricValues[2].value),
    pageViewsPerSession: Math.round(Number(row.metricValues[3].value) * 100) / 100,
    avgSessionDuration: Math.round(Number(row.metricValues[4].value) * 10) / 10,
    engagementRate: Math.round(Number(row.metricValues[5].value) * 10000) / 100,
  }));
}

/** 특정 page path 도달 세션 수를 캠페인별로 집계 (퍼널 진입·완료 카운트용) */
async function getPagePathByCampaign(client, date, pagePath) {
  const res = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
      { name: "sessionManualAdContent" },
    ],
    metrics: [{ name: "sessions" }],
    dimensionFilter: {
      andGroup: {
        expressions: [
          utmTrafficFilter(),
          {
            filter: {
              fieldName: "pagePath",
              stringFilter: { matchType: "EXACT", value: pagePath },
            },
          },
        ],
      },
    },
    limit: 100,
  });

  if (!res.rows) return {};
  const map = {};
  for (const row of res.rows) {
    const key = [
      row.dimensionValues[0].value,
      row.dimensionValues[1].value,
      row.dimensionValues[2].value,
      row.dimensionValues[3].value,
    ].join("|");
    map[key] = Number(row.metricValues[0].value);
  }
  return map;
}

/** 캠페인별 가장 많이 본 페이지 Top N (행동 경로 분석용) */
async function getTopPagesByCampaign(client, date, limit = 100) {
  const res = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
      { name: "sessionManualAdContent" },
      { name: "pagePath" },
    ],
    metrics: [{ name: "screenPageViews" }],
    dimensionFilter: utmTrafficFilter(),
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  });

  if (!res.rows) return {};
  const map = {};
  for (const row of res.rows) {
    const key = [
      row.dimensionValues[0].value,
      row.dimensionValues[1].value,
      row.dimensionValues[2].value,
      row.dimensionValues[3].value,
    ].join("|");
    const page = row.dimensionValues[4].value;
    const views = Number(row.metricValues[0].value);
    if (!map[key]) map[key] = [];
    map[key].push({ page, views });
  }
  // 각 캠페인별 Top 5만 유지
  for (const k of Object.keys(map)) {
    map[k] = map[k].sort((a, b) => b.views - a.views).slice(0, 5);
  }
  return map;
}

/** 캠페인 키 (행 식별자) */
function campaignKey(row) {
  return [row.source, row.medium, row.campaign, row.content].join("|");
}

/**
 * Content Funnel 데이터 수집
 * @param {string} targetDate - YYYY-MM-DD
 */
async function collectContentFunnel(targetDate) {
  const client = createClient();

  const [behavior, demoIntent, demoComplete, topPagesByCampaign] = await Promise.all([
    getBehaviorByCampaign(client, targetDate),
    getPagePathByCampaign(client, targetDate, DEMO_PATH),
    getPagePathByCampaign(client, targetDate, THANKYOU_PATH),
    getTopPagesByCampaign(client, targetDate),
  ]);

  // behavior에 퍼널 메트릭과 topPages 매핑
  const campaigns = behavior.map((row) => {
    const k = campaignKey(row);
    const demoIntentSessions = demoIntent[k] || 0;
    const demoCompleteSessions = demoComplete[k] || 0;
    return {
      ...row,
      demoIntentSessions,
      demoCompleteSessions,
      demoIntentRate: row.sessions > 0
        ? Math.round((demoIntentSessions / row.sessions) * 10000) / 100
        : 0,
      demoCompleteRate: row.sessions > 0
        ? Math.round((demoCompleteSessions / row.sessions) * 10000) / 100
        : 0,
      topPages: topPagesByCampaign[k] || [],
    };
  });

  // 캠페인 합산 요약
  const totalSessions = campaigns.reduce((s, c) => s + c.sessions, 0);
  const totalDemoIntent = campaigns.reduce((s, c) => s + c.demoIntentSessions, 0);
  const totalDemoComplete = campaigns.reduce((s, c) => s + c.demoCompleteSessions, 0);

  return {
    date: targetDate,
    summary: {
      campaignCount: campaigns.length,
      totalSessions,
      totalDemoIntent,
      totalDemoComplete,
      overallDemoIntentRate: totalSessions > 0
        ? Math.round((totalDemoIntent / totalSessions) * 10000) / 100
        : 0,
      overallDemoCompleteRate: totalSessions > 0
        ? Math.round((totalDemoComplete / totalSessions) * 10000) / 100
        : 0,
    },
    campaigns,
  };
}

module.exports = { collectContentFunnel };
