/**
 * GSC(Google Search Console) 데이터 수집기
 * 검색 성과 데이터(클릭, 노출, CTR, 순위)를 수집한다.
 *
 * 참고: GSC 데이터는 2~3일 지연될 수 있다.
 * 어제 데이터가 없으면 가장 최근 가용 날짜로 fallback한다.
 */

const { google } = require("googleapis");
const { getAuthClient } = require("../utils/google-auth");

// 메인 사이트 + 블로그 둘 다 수집
const SITE_URLS = (process.env.GSC_SITE_URL || "https://perfectwin.ai/,https://blog.perfectwin.ai/")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * GSC에 등록된 사이트 목록에서 수집 대상 URL들을 검증한다.
 * 등록되어 있는 사이트만 반환한다.
 */
async function verifyAndResolveSites(searchconsole) {
  const res = await searchconsole.sites.list();
  const registered = res.data.siteEntry || [];
  const resolved = [];

  for (const url of SITE_URLS) {
    // 정확히 일치
    const exact = registered.find((s) => s.siteUrl === url);
    if (exact) { resolved.push(exact.siteUrl); continue; }

    // sc-domain 형태
    const domain = url.replace(/https?:\/\//, "").replace(/\/$/, "");
    const scDomain = registered.find((s) => s.siteUrl === `sc-domain:${domain}`);
    if (scDomain) { resolved.push(scDomain.siteUrl); continue; }

    // 부분 일치
    const partial = registered.find((s) => s.siteUrl.includes(domain));
    if (partial) { resolved.push(partial.siteUrl); continue; }

    console.warn(`  [GSC] ${url} — 등록되지 않은 사이트, 건너뜀`);
  }

  if (resolved.length === 0) {
    console.warn(`  [GSC] 등록된 사이트 목록: ${registered.map((s) => s.siteUrl).join(", ")}`);
    throw new Error("GSC에 수집 가능한 사이트가 없습니다.");
  }
  return resolved;
}

/**
 * 특정 날짜의 사이트 전체 검색 성과 합계를 가져온다.
 * 데이터가 없으면 null을 반환한다.
 */
async function getSiteTotals(searchconsole, siteUrl, date) {
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: date,
      endDate: date,
      dimensions: ["date"],
    },
  });

  const row = res.data.rows && res.data.rows[0];
  if (!row) return null;

  return {
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100, // 퍼센트로 변환 (소수 2자리)
    position: Math.round(row.position * 10) / 10,
  };
}

/**
 * 상위 검색어 Top N
 */
async function getTopQueries(searchconsole, siteUrl, date, limit = 10) {
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: date, endDate: date, dimensions: ["query"], rowLimit: limit },
  });
  if (!res.data.rows) return [];
  return res.data.rows.map((row) => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 10) / 10,
  }));
}

/**
 * 상위 페이지(URL)별 검색 성과 Top N
 */
async function getTopPages(searchconsole, siteUrl, date, limit = 10) {
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: date, endDate: date, dimensions: ["page"], rowLimit: limit },
  });
  if (!res.data.rows) return [];
  return res.data.rows.map((row) => ({
    page: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 10) / 10,
  }));
}

/**
 * 기기별 검색 성과
 */
async function getDeviceBreakdown(searchconsole, siteUrl, date) {
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: date, endDate: date, dimensions: ["device"] },
  });
  if (!res.data.rows) return [];
  return res.data.rows.map((row) => ({
    device: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 10) / 10,
  }));
}

/**
 * 국가별 검색 성과 Top N
 */
async function getCountryBreakdown(searchconsole, siteUrl, date, limit = 10) {
  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: date, endDate: date, dimensions: ["country"], rowLimit: limit },
  });
  if (!res.data.rows) return [];
  return res.data.rows.map((row) => ({
    country: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: Math.round(row.ctr * 10000) / 100,
    position: Math.round(row.position * 10) / 10,
  }));
}

/**
 * 가용한 가장 최근 날짜를 찾는다 (최대 5일 전까지).
 * GSC 데이터 지연에 대한 fallback.
 */
async function findAvailableDate(searchconsole, siteUrl, startDate) {
  const d = new Date(startDate);
  for (let i = 0; i < 5; i++) {
    const dateStr = d.toISOString().split("T")[0];
    const data = await getSiteTotals(searchconsole, siteUrl, dateStr);
    if (data) return { date: dateStr, data };
    d.setDate(d.getDate() - 1);
  }
  return null;
}

/**
 * 단일 사이트의 GSC 데이터를 수집한다.
 */
async function collectSingleSite(searchconsole, siteUrl, targetDate) {
  const label = siteUrl.replace(/https?:\/\//, "").replace(/\/$/, "");

  let totals = await getSiteTotals(searchconsole, siteUrl, targetDate);
  let actualDate = targetDate;

  if (!totals) {
    console.log(`  [GSC:${label}] ${targetDate} 데이터 없음, 최근 가용 날짜 탐색...`);
    const fallback = await findAvailableDate(searchconsole, siteUrl, targetDate);
    if (fallback) {
      actualDate = fallback.date;
      totals = fallback.data;
      console.log(`  [GSC:${label}] fallback: ${actualDate} 데이터 사용`);
    } else {
      console.warn(`  [GSC:${label}] 최근 5일 내 가용 데이터 없음`);
      return { siteUrl, label, date: targetDate, actualDate: null, totals: null, topQueries: [], topPages: [], devices: [], countries: [] };
    }
  }

  const [topQueries, topPages, devices, countries] = await Promise.all([
    getTopQueries(searchconsole, siteUrl, actualDate),
    getTopPages(searchconsole, siteUrl, actualDate),
    getDeviceBreakdown(searchconsole, siteUrl, actualDate),
    getCountryBreakdown(searchconsole, siteUrl, actualDate),
  ]);
  console.log(`  [GSC:${label}] 클릭 ${totals.clicks}, 노출 ${totals.impressions}`);

  return { siteUrl, label, date: targetDate, actualDate, totals, topQueries, topPages, devices, countries };
}

/**
 * GSC 데이터 전체 수집 (여러 사이트)
 * @param {string} targetDate - YYYY-MM-DD (어제 날짜)
 * @returns {Object} - { sites: [...], date }
 */
async function collectGSC(targetDate) {
  const authClient = await getAuthClient();
  const searchconsole = google.searchconsole({ version: "v1", auth: authClient });

  const siteUrls = await verifyAndResolveSites(searchconsole);
  console.log(`  [GSC] 수집 대상: ${siteUrls.join(", ")}`);

  const sites = [];
  for (const siteUrl of siteUrls) {
    const result = await collectSingleSite(searchconsole, siteUrl, targetDate);
    sites.push(result);
  }

  return { date: targetDate, sites };
}

module.exports = { collectGSC };
