/**
 * GA4 데이터 수집기
 * Google Analytics Data API v1을 사용하여 전체 성과 데이터를 수집한다.
 */

const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const { KEY_FILE } = require("../utils/google-auth");

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "494841765";

function createClient() {
  return new BetaAnalyticsDataClient({
    keyFilename: require("path").resolve(KEY_FILE),
  });
}

// ─── 헬퍼 ──────────────────────────────────────────────

function parseRows(response, dimCount = 1) {
  if (!response.rows) return [];
  return response.rows.map((row) => {
    const dims = row.dimensionValues.map((d) => d.value);
    const mets = row.metricValues.map((m) => {
      const n = Number(m.value);
      return Number.isNaN(n) ? m.value : n;
    });
    return { dims, mets };
  });
}

async function runReport(client, opts) {
  const [response] = await client.runReport({
    property: `properties/${PROPERTY_ID}`,
    ...opts,
  });
  return response;
}

// ─── 개별 수집 함수 ─────────────────────────────────────

/**
 * 사이트 전체 요약 (GA4 API는 요청당 메트릭 10개 제한 → 2개로 분할)
 */
async function getSiteSummary(client, date) {
  const [res1, res2] = await Promise.all([
    runReport(client, {
      dateRanges: [{ startDate: date, endDate: date }],
      metrics: [
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "screenPageViews" },
        { name: "bounceRate" },
        { name: "engagementRate" },
        { name: "averageSessionDuration" },
      ],
    }),
    runReport(client, {
      dateRanges: [{ startDate: date, endDate: date }],
      metrics: [
        { name: "screenPageViewsPerSession" },
        { name: "userEngagementDuration" },
        { name: "eventCount" },
      ],
    }),
  ]);

  const row1 = res1.rows && res1.rows[0];
  const row2 = res2.rows && res2.rows[0];
  if (!row1) {
    return {
      activeUsers: 0, newUsers: 0, returningUsers: 0,
      sessions: 0, engagedSessions: 0,
      pageViews: 0, bounceRate: 0, engagementRate: 0,
      avgSessionDuration: 0, pageViewsPerSession: 0,
      totalEngagementTime: 0, eventCount: 0,
    };
  }

  const m1 = row1.metricValues.map((v) => Number(v.value));
  const m2 = row2 ? row2.metricValues.map((v) => Number(v.value)) : [0, 0, 0];
  return {
    activeUsers: m1[0],
    newUsers: m1[1],
    returningUsers: m1[0] - m1[1],
    sessions: m1[2],
    engagedSessions: m1[3],
    pageViews: m1[4],
    bounceRate: Math.round(m1[5] * 10000) / 100,       // % (소수 2자리)
    engagementRate: Math.round(m1[6] * 10000) / 100,    // %
    avgSessionDuration: Math.round(m1[7] * 10) / 10,    // 초
    pageViewsPerSession: Math.round(m2[0] * 100) / 100,
    totalEngagementTime: Math.round(m2[1]),              // 초
    eventCount: m2[2],
  };
}

/**
 * 페이지별 조회수 Top N
 */
async function getTopPages(client, date, limit = 10) {
  const response = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "activeUsers" },
      { name: "averageSessionDuration" },
      { name: "bounceRate" },
    ],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  });

  if (!response.rows) return [];
  return response.rows.map((row) => ({
    pagePath: row.dimensionValues[0].value,
    pageTitle: row.dimensionValues[1].value,
    pageViews: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    avgDuration: Math.round(Number(row.metricValues[2].value) * 10) / 10,
    bounceRate: Math.round(Number(row.metricValues[3].value) * 10000) / 100,
  }));
}

/**
 * 유입 경로(채널 그룹)별 세션
 */
async function getChannelBreakdown(client, date) {
  const response = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "engagementRate" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  if (!response.rows) return [];
  return response.rows.map((row) => ({
    channel: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    engagementRate: Math.round(Number(row.metricValues[2].value) * 10000) / 100,
  }));
}

/**
 * 유입 소스/매체 상세
 */
async function getSourceMedium(client, date, limit = 10) {
  const response = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });

  if (!response.rows) return [];
  return response.rows.map((row) => ({
    source: row.dimensionValues[0].value,
    medium: row.dimensionValues[1].value,
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    engagementRate: Math.round(Number(row.metricValues[2].value) * 10000) / 100,
    avgDuration: Math.round(Number(row.metricValues[3].value) * 10) / 10,
  }));
}

/**
 * UTM 캠페인별 성과 (LinkedIn 등 소셜 UTM 추적용)
 * source에 "linkedin"이 포함된 트래픽을 campaign별로 분류한다.
 */
async function getUtmCampaigns(client, date) {
  const response = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViews" },
    ],
    dimensionFilter: {
      filter: {
        fieldName: "sessionMedium",
        stringFilter: { matchType: "EXACT", value: "social" },
      },
    },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 20,
  });

  if (!response.rows) return [];
  return response.rows.map((row) => ({
    source: row.dimensionValues[0].value,
    medium: row.dimensionValues[1].value,
    campaign: row.dimensionValues[2].value,
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    engagementRate: Math.round(Number(row.metricValues[2].value) * 10000) / 100,
    avgDuration: Math.round(Number(row.metricValues[3].value) * 10) / 10,
    pageViews: Number(row.metricValues[4].value),
  }));
}

/**
 * 기기 카테고리별 분포
 */
async function getDeviceBreakdown(client, date) {
  const response = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "deviceCategory" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "screenPageViews" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  if (!response.rows) return [];
  return response.rows.map((row) => ({
    device: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    pageViews: Number(row.metricValues[2].value),
    engagementRate: Math.round(Number(row.metricValues[3].value) * 10000) / 100,
    avgDuration: Math.round(Number(row.metricValues[4].value) * 10) / 10,
  }));
}

/**
 * 국가별 트래픽
 */
async function getCountryBreakdown(client, date, limit = 10) {
  const response = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "country" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "engagementRate" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });

  if (!response.rows) return [];
  return response.rows.map((row) => ({
    country: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    engagementRate: Math.round(Number(row.metricValues[2].value) * 10000) / 100,
  }));
}

/**
 * 랜딩 페이지별 성과
 */
async function getLandingPages(client, date, limit = 10) {
  const response = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [
      { name: "sessions" },
      { name: "activeUsers" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
      { name: "screenPageViewsPerSession" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });

  if (!response.rows) return [];
  return response.rows.map((row) => ({
    landingPage: row.dimensionValues[0].value,
    sessions: Number(row.metricValues[0].value),
    users: Number(row.metricValues[1].value),
    bounceRate: Math.round(Number(row.metricValues[2].value) * 10000) / 100,
    avgDuration: Math.round(Number(row.metricValues[3].value) * 10) / 10,
    pagesPerSession: Math.round(Number(row.metricValues[4].value) * 100) / 100,
  }));
}

// ─── 통합 수집 ──────────────────────────────────────────

/**
 * GA4 데이터 전체 수집
 * @param {string} targetDate - YYYY-MM-DD
 * @returns {Object}
 */
async function collectGA4(targetDate) {
  const client = createClient();

  const [summary, topPages, channels, sourceMedium, devices, countries, landingPages, utmCampaigns] =
    await Promise.all([
      getSiteSummary(client, targetDate),
      getTopPages(client, targetDate),
      getChannelBreakdown(client, targetDate),
      getSourceMedium(client, targetDate),
      getDeviceBreakdown(client, targetDate),
      getCountryBreakdown(client, targetDate),
      getLandingPages(client, targetDate),
      getUtmCampaigns(client, targetDate),
    ]);

  return {
    date: targetDate,
    summary,
    topPages,
    channels,
    sourceMedium,
    devices,
    countries,
    landingPages,
    utmCampaigns,
  };
}

module.exports = { collectGA4 };
