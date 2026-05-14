/**
 * Demo Funnel 데이터 수집기
 *
 * /contact-us/thankyou 페이지뷰 = 데모 신청 submit 완료 신호.
 * /contact-us/request-demo 페이지뷰 = 데모 신청 의향(폼 진입) 신호.
 *
 * 두 페이지의 도달 사용자에 대해 어떤 콘텐츠/채널이 보냈는지
 * GA4 차원별 breakdown을 수집한다. 콘텐츠 의사결정용 어트리뷰션 데이터.
 */

const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const { KEY_FILE } = require("../utils/google-auth");

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "494841765";

// Framer 사이트의 데모 신청 경로
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

function pathFilter(pagePath) {
  return {
    filter: {
      fieldName: "pagePath",
      stringFilter: { matchType: "EXACT", value: pagePath },
    },
  };
}

async function getPageTotals(client, date, pagePath) {
  const res = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensionFilter: pathFilter(pagePath),
    metrics: [
      { name: "screenPageViews" },
      { name: "sessions" },
      { name: "activeUsers" },
    ],
  });
  const row = res.rows?.[0];
  if (!row) return { pageViews: 0, sessions: 0, users: 0 };
  const m = row.metricValues.map((v) => Number(v.value));
  return { pageViews: m[0], sessions: m[1], users: m[2] };
}

async function getBreakdown(client, date, pagePath, dimensions, limit = 25) {
  const res = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    dimensionFilter: pathFilter(pagePath),
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  });
  if (!res.rows) return [];
  return res.rows.map((row) => {
    const out = {};
    dimensions.forEach((d, i) => { out[d] = row.dimensionValues[i].value; });
    out.sessions = Number(row.metricValues[0].value);
    out.users = Number(row.metricValues[1].value);
    return out;
  });
}

/**
 * 데모 퍼널 데이터 수집
 * @param {string} targetDate - YYYY-MM-DD
 * @returns {Object}
 */
async function collectDemoFunnel(targetDate) {
  const client = createClient();

  const [
    requestTotals,
    thankyouTotals,
    submitBySourceMedium,
    submitByCampaign,
    submitByLandingPage,
    submitByFirstUserSource,
    intentByLandingPage,
  ] = await Promise.all([
    getPageTotals(client, targetDate, DEMO_PATH),
    getPageTotals(client, targetDate, THANKYOU_PATH),
    getBreakdown(client, targetDate, THANKYOU_PATH, ["sessionSource", "sessionMedium"]),
    getBreakdown(client, targetDate, THANKYOU_PATH, ["sessionCampaignName", "sessionSource", "sessionMedium"]),
    getBreakdown(client, targetDate, THANKYOU_PATH, ["landingPagePlusQueryString"]),
    getBreakdown(client, targetDate, THANKYOU_PATH, ["firstUserSource", "firstUserMedium"]),
    getBreakdown(client, targetDate, DEMO_PATH, ["landingPagePlusQueryString"]),
  ]);

  const submissions = thankyouTotals.sessions;
  const intent = requestTotals.sessions;
  const conversionRate = intent > 0
    ? Math.round((submissions / intent) * 10000) / 100
    : null;

  return {
    date: targetDate,
    paths: { request: DEMO_PATH, thankyou: THANKYOU_PATH },
    summary: {
      demoPageSessions: intent,                  // 데모 페이지 도달 세션 (의향)
      demoPagePageViews: requestTotals.pageViews,
      demoPageUsers: requestTotals.users,
      submissions: submissions,                   // submit 완료 세션 (실제 리드 ≈ 영업팀 메일 수)
      submissionPageViews: thankyouTotals.pageViews,
      submissionUsers: thankyouTotals.users,
      conversionRate,                             // 데모 페이지 → submit 전환율 (%)
    },
    // 어트리뷰션 — submit한 세션 기준
    submit: {
      bySourceMedium: submitBySourceMedium,       // 채널 (last-touch)
      byCampaign: submitByCampaign,                // UTM (표준화 이후 의미 있어짐)
      byLandingPage: submitByLandingPage,          // 첫 진입 페이지 = 콘텐츠 어트리뷰션 핵심
      byFirstUserSource: submitByFirstUserSource,  // first-touch 어트리뷰션
    },
    // 의향만 표시한 사용자 (어디서 데모 페이지로 왔지만 submit 안 함)
    intent: {
      byLandingPage: intentByLandingPage,
    },
  };
}

module.exports = { collectDemoFunnel, DEMO_PATH, THANKYOU_PATH };
