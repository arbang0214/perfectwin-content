/**
 * Demo Funnel 데이터 수집기 (이벤트 기반)
 *
 * 데모 페이지가 외부 임포트 폼이라 page_path가 GA4에 부정확하게 잡힘.
 * 따라서 페이지뷰 대신 GA4 이벤트로 직접 카운트한다:
 *   - 데모 신청 완료(submissions)  = eventName "데모신청완료" 이벤트
 *   - 데모 신청 의향(demoPageSessions) = eventName "form_start" 이벤트
 *
 * 이벤트 발생 세션에 대해 어떤 콘텐츠/채널이 보냈는지
 * GA4 차원별 breakdown을 수집한다.
 */

const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const { KEY_FILE } = require("../utils/google-auth");

const PROPERTY_ID = process.env.GA4_PROPERTY_ID || "494841765";

// 데모 퍼널 신호 이벤트 (사이트 코드에서 발화)
const SUBMIT_EVENT = "데모신청완료";  // 폼 제출 완료 시 사이트가 GA4에 push
const INTENT_EVENT = "form_start";    // 폼 입력 시작 (GA4 Enhanced Measurement 자동)

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

function eventFilter(eventName) {
  return {
    filter: {
      fieldName: "eventName",
      stringFilter: { matchType: "EXACT", value: eventName },
    },
  };
}

async function getEventTotals(client, date, eventName) {
  const res = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensionFilter: eventFilter(eventName),
    metrics: [
      { name: "eventCount" },
      { name: "sessions" },
      { name: "activeUsers" },
    ],
  });
  const row = res.rows?.[0];
  if (!row) return { eventCount: 0, sessions: 0, users: 0 };
  const m = row.metricValues.map((v) => Number(v.value));
  return { eventCount: m[0], sessions: m[1], users: m[2] };
}

async function getBreakdown(client, date, eventName, dimensions, limit = 25) {
  const res = await runReport(client, {
    dateRanges: [{ startDate: date, endDate: date }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: [{ name: "sessions" }, { name: "activeUsers" }],
    dimensionFilter: eventFilter(eventName),
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
 * 데모 퍼널 데이터 수집 (이벤트 기반)
 * @param {string} targetDate - YYYY-MM-DD
 * @returns {Object}
 */
async function collectDemoFunnel(targetDate) {
  const client = createClient();

  const [
    intentTotals,
    submitTotals,
    submitBySourceMedium,
    submitByCampaign,
    submitByLandingPage,
    submitByFirstUserSource,
    intentByLandingPage,
  ] = await Promise.all([
    getEventTotals(client, targetDate, INTENT_EVENT),
    getEventTotals(client, targetDate, SUBMIT_EVENT),
    getBreakdown(client, targetDate, SUBMIT_EVENT, ["sessionSource", "sessionMedium"]),
    getBreakdown(client, targetDate, SUBMIT_EVENT, ["sessionCampaignName", "sessionSource", "sessionMedium"]),
    getBreakdown(client, targetDate, SUBMIT_EVENT, ["landingPagePlusQueryString"]),
    getBreakdown(client, targetDate, SUBMIT_EVENT, ["firstUserSource", "firstUserMedium"]),
    getBreakdown(client, targetDate, INTENT_EVENT, ["landingPagePlusQueryString"]),
  ]);

  const submissions = submitTotals.sessions;
  const intent = intentTotals.sessions;
  const conversionRate = intent > 0
    ? Math.round((submissions / intent) * 10000) / 100
    : null;

  return {
    date: targetDate,
    events: { intent: INTENT_EVENT, submit: SUBMIT_EVENT },
    summary: {
      demoPageSessions: intent,                  // form_start 발생 세션 (의향)
      demoPageEventCount: intentTotals.eventCount,
      demoPageUsers: intentTotals.users,
      submissions: submissions,                   // 데모신청완료 이벤트 발생 세션 (=리드)
      submissionEventCount: submitTotals.eventCount,
      submissionUsers: submitTotals.users,
      conversionRate,                             // form_start → 데모신청완료 전환율 (%)
    },
    // 어트리뷰션 — 데모신청완료 이벤트 발생 세션 기준
    submit: {
      bySourceMedium: submitBySourceMedium,       // 채널 (last-touch)
      byCampaign: submitByCampaign,                // UTM
      byLandingPage: submitByLandingPage,          // 첫 진입 페이지 = 콘텐츠 어트리뷰션 핵심
      byFirstUserSource: submitByFirstUserSource,  // first-touch 어트리뷰션
    },
    // form_start만 한 사용자 (폼 입력 시작했지만 제출 안 함)
    intent: {
      byLandingPage: intentByLandingPage,
    },
  };
}

module.exports = { collectDemoFunnel, SUBMIT_EVENT, INTENT_EVENT };
