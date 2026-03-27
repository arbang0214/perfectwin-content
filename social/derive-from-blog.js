#!/usr/bin/env node
/**
 * 블로그 원문 → LinkedIn/X 소셜 포스트 파생 모듈
 *
 * scripts/generate-content.js의 Step 3(소셜 포스트 생성)을 독립 모듈로 분리.
 * 대시보드에서도, CLI에서도 호출 가능하도록 함수 단위로 export한다.
 *
 * 사용 예:
 *   node social/derive-from-blog.js --week 2026-03-20
 *   (해당 주차의 blog-en.md를 읽어서 소셜 포스트 생성)
 */

const path = require("path");
const { callClaude, delayBetweenCalls } = require("../scripts/lib/claude-api");
const { loadPrompt, buildPrompt, getSystemPrompt } = require("../scripts/lib/prompts");
const { saveContent, readContent, fileExists } = require("../scripts/lib/file-manager");

function buildUtmLinks(slug) {
  const base = `https://perfectwin.io/blog/${slug}`;
  return {
    "linkedin-company": `${base}?utm_source=linkedin-company&utm_medium=social&utm_campaign=${slug}`,
    "linkedin-personal": `${base}?utm_source=linkedin-personal&utm_medium=social&utm_campaign=${slug}`,
    "x-twitter": `${base}?utm_source=x-twitter&utm_medium=social&utm_campaign=${slug}`,
  };
}

/**
 * 블로그 영문 원문에서 소셜 포스트를 파생 생성한다.
 * @param {Object} opts
 * @param {string} opts.blogEn - 영문 블로그 본문
 * @param {string} opts.slug - 블로그 URL 슬러그
 * @param {string} opts.weekDir - 출력 디렉토리 (output/week-YYYY-MM-DD)
 * @param {string[]} [opts.types] - 생성할 타입 ["linkedin-company","linkedin-personal","x-posts"]
 * @returns {Object} - { linkedinCompany, linkedinPersonal, xPosts }
 */
async function deriveSocialPosts(opts) {
  const { blogEn, slug, weekDir, types } = opts;
  const systemPrompt = getSystemPrompt();
  const blogUrl = `https://perfectwin.io/blog/${slug}`;
  const utmLinks = buildUtmLinks(slug);
  const selectedTypes = types || ["linkedin-company", "linkedin-personal", "x-posts"];

  if (!blogEn) {
    throw new Error("blog-en.md 내용이 필요합니다.");
  }

  const results = {};
  const socialTasks = [];
  const socialKeys = [];

  if (selectedTypes.includes("linkedin-company")) {
    socialKeys.push("linkedin-company");
    socialTasks.push(callClaude(systemPrompt, buildPrompt(loadPrompt("linkedin-company.md"), {
      blog_content: blogEn, blog_url: blogUrl,
      utm_params: `utm_source=linkedin-company&utm_medium=social&utm_campaign=${slug}`,
    })));
  }
  if (selectedTypes.includes("linkedin-personal")) {
    socialKeys.push("linkedin-personal");
    socialTasks.push(callClaude(systemPrompt, buildPrompt(loadPrompt("linkedin-personal.md"), {
      blog_content: blogEn, blog_url: blogUrl,
      utm_params: `utm_source=linkedin-personal&utm_medium=social&utm_campaign=${slug}`,
    })));
  }
  if (selectedTypes.includes("x-posts")) {
    socialKeys.push("x-posts");
    socialTasks.push(callClaude(systemPrompt, buildPrompt(loadPrompt("x-posts.md"), {
      blog_content: blogEn, blog_url: blogUrl,
      utm_params: `utm_source=x-twitter&utm_medium=social&utm_campaign=${slug}`,
    })));
  }

  const taskResults = await Promise.all(socialTasks);
  const imageRef = "\n\n## IMAGE\nimages/blog-thumbnail.png";

  socialKeys.forEach((key, i) => {
    const utmUrl = utmLinks[key === "x-posts" ? "x-twitter" : key];
    const content = taskResults[i].replaceAll("[BLOG_URL]", utmUrl || blogUrl);
    results[key] = content;

    if (weekDir) {
      saveContent(weekDir, "content", `${key}.md`, content + imageRef);
      console.log(`  -> content/${key}.md saved`);
    }
  });

  return results;
}

// ─── CLI 모드 ─────────────────────────────────────────────
if (require.main === module) {
  require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

  const args = process.argv.slice(2);
  let weekArg = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--week" && args[i + 1]) weekArg = args[++i];
  }

  if (!weekArg) {
    console.error("Usage: node social/derive-from-blog.js --week YYYY-MM-DD");
    process.exit(1);
  }

  const weekDir = path.join(__dirname, "..", "output", `week-${weekArg}`);
  const blogEn = readContent(weekDir, "content", "blog-en.md");
  if (!blogEn) {
    console.error(`blog-en.md not found in ${weekDir}/content/`);
    process.exit(1);
  }

  // 슬러그 추출
  const slugMatch = blogEn.match(/URL\s*(?:슬러그|Slug)\s*\**\s*[:：]\s*`?([a-z0-9][a-z0-9-]+[a-z0-9])`?/im);
  const slug = slugMatch ? slugMatch[1] : "weekly-blog";

  deriveSocialPosts({ blogEn, slug, weekDir })
    .then(() => console.log("\nSocial posts generated!"))
    .catch((err) => { console.error("Error:", err.message); process.exit(1); });
}

module.exports = { deriveSocialPosts, buildUtmLinks };
