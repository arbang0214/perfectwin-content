/**
 * Bing Webmaster Tools 데이터 수집기
 * GetQueryStats API로 Bing 검색 노출/클릭/순위 데이터를 수집한다.
 *
 * API 문서: https://learn.microsoft.com/en-us/bingwebmaster/
 */

const API_KEY = process.env.BING_WEBMASTER_API_KEY || "";
const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

const SITES = [
  { siteUrl: "https://perfectwin.ai/", label: "perfectwin.ai" },
  { siteUrl: "https://blog.perfectwin.ai/", label: "blog.perfectwin.ai" },
  { siteUrl: "https://ko.blog.perfectwin.ai/", label: "ko.blog.perfectwin.ai" },
];

/**
 * Bing Webmaster API 호출
 */
async function bingRequest(method, siteUrl) {
  const encoded = encodeURIComponent(siteUrl);
  const url = `${API_BASE}/${method}?apikey=${API_KEY}&siteUrl=${encoded}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Bing API ${method} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

/**
 * 특정 사이트의 검색 쿼리 통계를 수집한다.
 * GetQueryStats는 최근 데이터를 날짜별로 반환 (최대 6개월).
 * targetDate에 해당하는 데이터만 필터링한다.
 */
async function collectSiteStats(site, targetDate) {
  const { siteUrl, label } = site;

  try {
    const data = await bingRequest("GetQueryStats", siteUrl);
    const rows = Array.isArray(data.d) ? data.d : [];

    // targetDate에 해당하는 행만 필터 (Bing Date 형식: /Date(timestamp)/)
    const targetTs = new Date(targetDate).getTime();
    const targetEnd = targetTs + 86400000; // +1일

    const dayRows = rows.filter((r) => {
      const match = r.Date?.match(/\/Date\((\d+)\)\//);
      if (!match) return false;
      const ts = Number(match[1]);
      return ts >= targetTs && ts < targetEnd;
    });

    // 전체 기간 데이터도 없으면 최근 가용 날짜 사용 (GSC fallback과 동일 패턴)
    let useRows = dayRows;
    let actualDate = targetDate;

    if (dayRows.length === 0 && rows.length > 0) {
      // 가장 최근 날짜 찾기
      const sorted = rows
        .map((r) => {
          const match = r.Date?.match(/\/Date\((\d+)\)\//);
          return match ? { ...r, ts: Number(match[1]) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.ts - a.ts);

      if (sorted.length > 0) {
        const latestTs = sorted[0].ts;
        actualDate = new Date(latestTs).toISOString().split("T")[0];
        useRows = sorted.filter((r) => r.ts === latestTs);
        console.log(`  [Bing:${label}] ${targetDate} 데이터 없음, fallback: ${actualDate}`);
      }
    }

    // 집계
    const totals = {
      clicks: useRows.reduce((s, r) => s + (r.Clicks || 0), 0),
      impressions: useRows.reduce((s, r) => s + (r.Impressions || 0), 0),
      avgClickPosition: 0,
      avgImpressionPosition: 0,
    };

    if (useRows.length > 0) {
      totals.avgClickPosition =
        Math.round(
          (useRows.reduce((s, r) => s + (r.AvgClickPosition || 0), 0) / useRows.length) * 10
        ) / 10;
      totals.avgImpressionPosition =
        Math.round(
          (useRows.reduce((s, r) => s + (r.AvgImpressionPosition || 0), 0) / useRows.length) * 10
        ) / 10;
    }

    totals.ctr =
      totals.impressions > 0 ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0;

    // Top 쿼리 (클릭/노출 기준 상위 10)
    const topQueries = useRows
      .sort((a, b) => (b.Impressions || 0) - (a.Impressions || 0))
      .slice(0, 10)
      .map((r) => ({
        query: r.Query,
        clicks: r.Clicks || 0,
        impressions: r.Impressions || 0,
        avgClickPosition: r.AvgClickPosition || 0,
        avgImpressionPosition: r.AvgImpressionPosition || 0,
      }));

    console.log(`  [Bing:${label}] 클릭 ${totals.clicks}, 노출 ${totals.impressions}`);

    return {
      label,
      siteUrl,
      actualDate,
      totals,
      topQueries,
    };
  } catch (err) {
    console.error(`  [Bing:${label}] 수집 실패: ${err.message}`);
    return {
      label,
      siteUrl,
      actualDate: targetDate,
      totals: { clicks: 0, impressions: 0, ctr: 0, avgClickPosition: 0, avgImpressionPosition: 0 },
      topQueries: [],
      error: err.message,
    };
  }
}

/**
 * 전체 Bing 검색 데이터 수집
 * @param {string} targetDate - YYYY-MM-DD
 */
async function collectBing(targetDate) {
  if (!API_KEY) {
    console.log("  [Bing] BING_WEBMASTER_API_KEY 미설정 — 건너뜀");
    return null;
  }

  console.log(`  [Bing] 수집 대상: ${SITES.map((s) => s.label).join(", ")}`);

  const sites = [];
  for (const site of SITES) {
    const result = await collectSiteStats(site, targetDate);
    sites.push(result);
  }

  return { date: targetDate, sites };
}

module.exports = { collectBing };
