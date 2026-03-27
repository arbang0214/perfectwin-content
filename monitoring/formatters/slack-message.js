/**
 * Slack 메시지 포맷터
 * 수집된 GA4/GSC 데이터를 콘솔 출력 및 Slack 전송용 문자열로 변환한다.
 *
 * 참고: 최종 Slack 메시지 디자인은 ARUM이 추후 결정.
 * 현재는 데이터를 읽기 쉽게 정리하는 수준.
 */

/**
 * 전일 대비 변화율을 계산한다.
 * @param {number} current - 오늘 값
 * @param {number} previous - 어제 값
 * @returns {string} - "+12.5%" 또는 "-3.2%" 또는 "N/A"
 */
function changeRate(current, previous) {
  if (previous == null || previous === 0) return "N/A";
  const rate = ((current - previous) / previous) * 100;
  const sign = rate >= 0 ? "+" : "";
  return `${sign}${rate.toFixed(1)}%`;
}

/**
 * GA4 데이터를 텍스트로 포맷한다.
 */
function formatGA4(ga4Data, prevGA4) {
  if (!ga4Data) return "❌ GA4 데이터 수집 실패";

  const { summary, topPages, channels } = ga4Data;
  const prev = prevGA4?.summary || {};

  let text = `📊 *GA4 — ${ga4Data.date}*\n`;
  text += `  방문자: ${summary.activeUsers} (${changeRate(summary.activeUsers, prev.activeUsers)})\n`;
  text += `  세션: ${summary.sessions} (${changeRate(summary.sessions, prev.sessions)})\n`;
  text += `  페이지뷰: ${summary.pageViews} (${changeRate(summary.pageViews, prev.pageViews)})\n`;

  if (topPages.length > 0) {
    text += `\n  📄 Top 페이지:\n`;
    topPages.forEach((p, i) => {
      text += `    ${i + 1}. ${p.pagePath} — ${p.pageViews}회\n`;
    });
  }

  if (channels.length > 0) {
    text += `\n  🔗 유입 경로:\n`;
    channels.forEach((c) => {
      text += `    ${c.channel}: ${c.sessions}회\n`;
    });
  }

  return text;
}

/**
 * GSC 데이터를 텍스트로 포맷한다 (다중 사이트 지원).
 */
function formatGSC(gscData, prevGSC) {
  if (!gscData || !gscData.sites) return "❌ GSC 데이터 수집 실패";

  let text = `🔍 *GSC — ${gscData.date}*\n`;
  const prevSites = prevGSC?.sites || [];

  for (const site of gscData.sites) {
    const prevSite = prevSites.find((s) => s.siteUrl === site.siteUrl);
    const prev = prevSite?.totals || {};
    const dateNote = site.actualDate && site.actualDate !== site.date ? ` (실제: ${site.actualDate})` : "";

    text += `\n  📌 ${site.label}${dateNote}\n`;

    if (!site.totals) {
      text += `    데이터 없음\n`;
      continue;
    }

    text += `    클릭: ${site.totals.clicks} (${changeRate(site.totals.clicks, prev.clicks)})\n`;
    text += `    노출: ${site.totals.impressions} (${changeRate(site.totals.impressions, prev.impressions)})\n`;
    text += `    CTR: ${site.totals.ctr}%\n`;
    text += `    평균 순위: ${site.totals.position}\n`;

    if (site.topQueries.length > 0) {
      text += `\n    🏷️ Top 검색어:\n`;
      site.topQueries.forEach((q, i) => {
        text += `      ${i + 1}. "${q.query}" — ${q.clicks}클릭, ${q.impressions}노출, 순위 ${q.position}\n`;
      });
    }
  }

  return text;
}

/**
 * 전체 일간 리포트를 포맷한다.
 * @param {Object} data - { ga4, gsc, date }
 * @param {Object|null} prevData - 전일 데이터 (비교용)
 * @returns {string}
 */
function formatDailyReport(data, prevData) {
  const header = `\n════════════════════════════════════════\n  PerfecTwin 일간 성과 리포트 — ${data.date}\n════════════════════════════════════════\n`;

  const ga4Section = formatGA4(data.ga4, prevData?.ga4);
  const gscSection = formatGSC(data.gsc, prevData?.gsc);

  const footer = `\n────────────────────────────────────────\n`;

  return header + "\n" + ga4Section + "\n\n" + gscSection + footer;
}

module.exports = { formatDailyReport, formatGA4, formatGSC, changeRate };
