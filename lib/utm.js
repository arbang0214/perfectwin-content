/**
 * UTM 자동 부착 helper
 *
 * 콘텐츠 본문(블로그 마크다운, LinkedIn 텍스트, X 포스트)에서 데모 페이지
 * URL을 찾아 채널별 UTM 파라미터를 자동으로 부착한다.
 *
 * 표준안 (routes/publish.js에서 적용):
 *   영문 블로그 CTA:    utm_source=blog-en   utm_medium=cta     utm_campaign={slug}
 *   한글 블로그 CTA:    utm_source=blog-ko   utm_medium=cta     utm_campaign={slug}
 *   LinkedIn 회사 포스트: utm_source=linkedin   utm_medium=social  utm_campaign={weekId} utm_content=company-{n}
 *   LinkedIn 개인 포스트: utm_source=linkedin   utm_medium=social  utm_campaign={weekId} utm_content=personal-{n}
 *   LinkedIn 댓글:       utm_source=linkedin   utm_medium=comment utm_campaign={weekId} utm_content={contentId}
 *   X 포스트:            utm_source=x          utm_medium=social  utm_campaign={weekId} utm_content=post-{n}
 */

// 데모 페이지 운영 URL — 다른 도메인(예: Framer 임시)도 잡고 싶으면 패턴 확장 가능
const DEMO_URL_PATTERN = /https?:\/\/perfectwin\.ai\/contact-us\/request-demo(?:\/?(?:\?[^\s"')<>]*)?)/g;

/**
 * URL에 UTM 파라미터를 부착한다. 이미 같은 키가 있으면 덮어쓴다.
 */
function tagUrl(url, params) {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") u.searchParams.set(k, v);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * 콘텐츠 본문에서 데모 페이지 URL을 모두 찾아 UTM 파라미터를 부착한다.
 * 이미 utm_source가 박혀있는 URL은 건드리지 않는다 (idempotent).
 *
 * 마크다운 링크, auto-link, 일반 텍스트 URL 모두 매칭됨.
 *
 * @param {string} body    원본 본문 (마크다운·일반 텍스트)
 * @param {Object} params  부착할 UTM 파라미터 (utm_source, utm_medium, utm_campaign, utm_content 등)
 * @returns {string}       UTM 부착된 본문
 */
function enrichBodyWithUtm(body, params) {
  if (!body || typeof body !== "string") return body;
  return body.replace(DEMO_URL_PATTERN, (match) => {
    if (/[?&]utm_source=/.test(match)) return match; // 이미 UTM 박혀있으면 패스
    return tagUrl(match, params);
  });
}

module.exports = { tagUrl, enrichBodyWithUtm, DEMO_URL_PATTERN };
