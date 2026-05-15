/**
 * 블로그 슬러그 → 제목 enrich helper.
 *
 * inblog collector가 만든 slugToTitle 매핑을 받아, 슬러그/URL만 있는 데이터
 * (GSC topPages, demoFunnel byLandingPage)에 title 필드를 추가한다.
 *
 * Claude 시스템 프롬프트에서 title 필드가 있으면 우선 표시하도록 지시.
 */

/**
 * URL/path에서 마지막 슬러그를 추출한다.
 *  - "https://blog.perfectwin.ai/some-slug" → "some-slug"
 *  - "/some-slug"                            → "some-slug"
 *  - "/blog-en/some-slug?utm=..."            → "some-slug"
 */
function extractSlug(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== "string") return null;
  try {
    let pathOnly = urlOrPath;
    if (/^https?:\/\//.test(urlOrPath)) {
      pathOnly = new URL(urlOrPath).pathname;
    }
    pathOnly = pathOnly.split("?")[0].split("#")[0];
    if (pathOnly.endsWith("/")) pathOnly = pathOnly.slice(0, -1);
    const segments = pathOnly.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    return segments[segments.length - 1];
  } catch {
    return null;
  }
}

function lookupTitle(slugToTitle, urlOrPath) {
  const slug = extractSlug(urlOrPath);
  if (!slug) return null;
  return slugToTitle[slug] || null;
}

/**
 * 통합 데이터의 슬러그가 등장하는 모든 위치를 in-place enrich.
 *  - GSC blog 사이트(들) topPages[].page → title 추가
 *  - demoFunnel submit/intent byLandingPage[].landingPagePlusQueryString → title 추가
 *
 * @param {Object} args
 * @param {Object[]} [args.gscBlogSites] GSC blog 사이트 객체 배열 (영문·한글 등)
 * @param {Object}   [args.demoFunnel]   데모 퍼널 객체 (submit, intent 포함)
 * @param {Object}   args.slugToTitle    slug → title 매핑 (영문+한글 합친 통합 맵)
 */
function enrichInplace({ gscBlogSites = [], demoFunnel, slugToTitle }) {
  if (!slugToTitle || Object.keys(slugToTitle).length === 0) return;

  const tagRow = (row, urlField) => {
    if (!row || !row[urlField]) return;
    const title = lookupTitle(slugToTitle, row[urlField]);
    if (title) row.title = title;
  };

  for (const site of gscBlogSites) {
    if (Array.isArray(site?.topPages)) {
      site.topPages.forEach((p) => tagRow(p, "page"));
    }
  }
  if (Array.isArray(demoFunnel?.submit?.byLandingPage)) {
    demoFunnel.submit.byLandingPage.forEach((r) => tagRow(r, "landingPagePlusQueryString"));
  }
  if (Array.isArray(demoFunnel?.intent?.byLandingPage)) {
    demoFunnel.intent.byLandingPage.forEach((r) => tagRow(r, "landingPagePlusQueryString"));
  }
}

module.exports = { extractSlug, lookupTitle, enrichInplace };
