/**
 * inblog 애널리틱스 수집기
 * 영문(blog.perfectwin.ai) + 한글(ko.blog.perfectwin.ai) 블로그 통계를 수집한다.
 *
 * API 문서: https://inblog.ai/api-docs
 * 인증: Authorization: Bearer {API_KEY}
 */

const https = require("https");

// 블로그 설정 (영문 + 한글)
function getBlogConfigs() {
  const configs = [];
  if (process.env.INBLOG_API_KEY) {
    configs.push({
      label: "blog-en",
      name: "영문 블로그",
      apiKey: process.env.INBLOG_API_KEY,
      subdomain: process.env.INBLOG_BLOG_SUBDOMAIN || "perfectwin",
      blogUrl: process.env.INBLOG_BLOG_URL || "https://blog.perfectwin.ai",
    });
  }
  if (process.env.INBLOG_KO_API_KEY) {
    configs.push({
      label: "blog-ko",
      name: "한글 블로그",
      apiKey: process.env.INBLOG_KO_API_KEY,
      subdomain: process.env.INBLOG_KO_BLOG_SUBDOMAIN || "kr-perfectwin",
      blogUrl: process.env.INBLOG_KO_BLOG_URL || "https://ko.blog.perfectwin.ai",
    });
  }
  return configs;
}

/**
 * inblog API 호출
 */
function apiRequest(path, apiKey) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "inblog.ai",
      path: `/api/v1${path}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

/**
 * 포스트 목록을 가져와 post_id → title 매핑을 만든다.
 * /api/v1/posts 엔드포인트는 페이지당 최대 100개를 반환한다.
 */
async function fetchPostTitleMap(apiKey) {
  const titleMap = {};
  let page = 1;
  const limit = 100;
  while (true) {
    const res = await apiRequest(`/posts?limit=${limit}&page=${page}`, apiKey);
    if (res.status !== 200 || !res.body?.data) break;
    for (const post of res.body.data) {
      titleMap[Number(post.id)] = post.attributes?.title || null;
    }
    const totalPages = res.body.meta?.totalPages || 1;
    if (page >= totalPages) break;
    page++;
  }
  return titleMap;
}

/**
 * 단일 블로그의 애널리틱스 데이터를 수집한다.
 */
async function collectSingleBlog(config, targetDate) {
  const { label, name, apiKey } = config;
  const dateParam = `start_date=${targetDate}&end_date=${targetDate}`;

  try {
    // 1. 블로그 전체 트래픽 (해당일)
    const trafficRes = await apiRequest(
      `/blogs/analytics/traffic?${dateParam}&interval=day&type=all`,
      apiKey
    );

    // 2. 포스트별 성과 Top 10
    const postsRes = await apiRequest(
      `/blogs/analytics/posts?${dateParam}&sort=visits&order=desc&limit=10`,
      apiKey
    );

    // 3. 유입 소스
    const sourcesRes = await apiRequest(
      `/blogs/analytics/sources?${dateParam}&limit=10`,
      apiKey
    );

    const traffic = trafficRes.status === 200 ? trafficRes.body : null;
    let posts = postsRes.status === 200 ? postsRes.body : null;
    const sources = sourcesRes.status === 200 ? sourcesRes.body : null;

    // 4. 포스트 제목 매핑 + 포스트별 LinkedIn 유입 추적
    if (posts?.data?.length) {
      const titleMap = await fetchPostTitleMap(apiKey);
      for (const p of posts.data) {
        if (p.post_id != null && titleMap[p.post_id]) {
          p.title = titleMap[p.post_id];
        } else if (p.post_id == null) {
          p.title = "(비포스트 페이지)";
        }
      }

      // 포스트별 소셜 유입 소스 수집 (post_id가 있는 것만)
      const postIds = posts.data.filter((p) => p.post_id != null).map((p) => p.post_id);
      for (const pid of postIds) {
        try {
          const srcRes = await apiRequest(
            `/blogs/analytics/posts/${pid}/sources?${dateParam}&limit=20`,
            apiKey
          );
          if (srcRes.status === 200 && srcRes.body?.data) {
            const post = posts.data.find((p) => p.post_id === pid);
            if (post) {
              post.sources = srcRes.body.data;
              post.linkedinVisits = srcRes.body.data
                .filter((s) => /linkedin/i.test(s.full_referrer))
                .reduce((sum, s) => sum + (s.count || 0), 0);
            }
          }
        } catch {
          // 개별 포스트 소스 실패는 무시
        }
      }
    }

    // 5. 블로그 전체 LinkedIn 유입 합산
    const linkedinTotal = posts?.data
      ?.reduce((sum, p) => sum + (p.linkedinVisits || 0), 0) || 0;

    console.log(`  [inblog:${label}] 수집 완료 (status: traffic=${trafficRes.status}, posts=${postsRes.status}, sources=${sourcesRes.status})`);

    return {
      label,
      name,
      blogUrl: config.blogUrl,
      date: targetDate,
      traffic,
      posts,
      sources,
      linkedinTotal,
    };
  } catch (err) {
    console.error(`  [inblog:${label}] 수집 실패: ${err.message}`);
    return {
      label,
      name,
      blogUrl: config.blogUrl,
      date: targetDate,
      traffic: null,
      posts: null,
      sources: null,
      error: err.message,
    };
  }
}

/**
 * 전체 inblog 데이터 수집 (영문 + 한글)
 * @param {string} targetDate - YYYY-MM-DD
 * @returns {Object} - { date, blogs: [...] }
 */
async function collectInblog(targetDate) {
  const configs = getBlogConfigs();
  if (configs.length === 0) {
    console.log("  [inblog] API 키 미설정 — 건너뜀");
    return null;
  }

  const blogs = [];
  for (const config of configs) {
    const result = await collectSingleBlog(config, targetDate);
    blogs.push(result);
  }

  return { date: targetDate, blogs };
}

module.exports = { collectInblog };
