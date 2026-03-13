#!/usr/bin/env node

/**
 * PerfecTwin 주간 콘텐츠 자동 생성 스크립트
 *
 * Usage:
 *   node scripts/generate-content.js \
 *     --topic "S/4HANA 마이그레이션 테스트 실패 Top 5" \
 *     --keywords "S/4HANA migration testing, SAP regression testing automation" \
 *     --angle "PerfecTwin의 Pre-built 템플릿으로 마이그레이션 테스트 커버리지 확보"
 */

const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

// ─── CLI args ───────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--topic" && args[i + 1]) parsed.topic = args[++i];
    else if (args[i] === "--keywords" && args[i + 1]) parsed.keywords = args[++i];
    else if (args[i] === "--angle" && args[i + 1]) parsed.angle = args[++i];
    else if (args[i] === "--intel" && args[i + 1]) parsed.intel = args[++i];
  }
  if (!parsed.topic || !parsed.keywords || !parsed.angle) {
    console.error(`
Usage:
  node scripts/generate-content.js \\
    --topic "주제" \\
    --keywords "키워드1, 키워드2" \\
    --angle "PerfecTwin 연결 포인트" \\
    [--intel "참고 데이터/트렌드 (선택)"]
`);
    process.exit(1);
  }
  return parsed;
}

// ─── Helpers ────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
}

function fillTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function todayStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ─── Claude API call ────────────────────────────────────────
async function callClaude(client, systemPrompt, userMessage) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: userMessage }],
    system: systemPrompt,
  });
  return response.content[0].text;
}

// ─── Extract slug from blog output ─────────────────────────
function extractSlug(blogContent) {
  const match = blogContent.match(/URL\s*(?:슬러그|Slug)\s*\**\s*[:：]\s*`?([a-z0-9][a-z0-9-]+[a-z0-9])`?/im);
  return match ? match[1] : "weekly-blog";
}

function extractMeta(blogKo, blogEn) {
  const extract = (text, field) => {
    const re = new RegExp(`\\*\\*${field}\\*\\*\\s*[:：]\\s*(.+)`, "i");
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };

  return {
    ko: {
      title: extract(blogKo, "제목"),
      metaDescription: extract(blogKo, "메타 디스크립션"),
      slug: extractSlug(blogKo),
      keywords: extract(blogKo, "SEO 키워드"),
    },
    en: {
      title: extract(blogEn, "Title"),
      metaDescription: extract(blogEn, "Meta Description"),
      slug: extractSlug(blogEn),
      keywords: extract(blogEn, "SEO Keywords"),
    },
  };
}

function buildUtmLinks(slug) {
  const base = `https://perfectwin.io/blog/${slug}`;
  const channels = [
    { key: "linkedin-company", source: "linkedin-company", medium: "social" },
    { key: "linkedin-personal", source: "linkedin-personal", medium: "social" },
    { key: "x-twitter", source: "x-twitter", medium: "social" },
    { key: "blog-ko", source: "blog-ko", medium: "blog" },
    { key: "blog-en", source: "blog-en", medium: "blog" },
    { key: "email-sig", source: "email-sig", medium: "email" },
  ];
  const links = {};
  for (const ch of channels) {
    links[ch.key] = `${base}?utm_source=${ch.source}&utm_medium=${ch.medium}&utm_campaign=${slug}`;
  }
  return links;
}

// ─── Main pipeline ──────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY not found in .env");
    process.exit(1);
  }

  const client = new Anthropic();
  const brandGuide = readFile("config/brand-guide.md");
  const weekDir = path.join(ROOT, "output", `week-${todayStamp()}`);
  ensureDir(weekDir);

  console.log(`\n=== PerfecTwin Content Generator ===`);
  console.log(`Topic: ${args.topic}`);
  console.log(`Output: ${weekDir}\n`);

  // ── Step 1: 한글 블로그 ───────────────────────────────────
  console.log("[1/5] Generating Korean blog...");
  const blogKoPrompt = readFile("prompts/blog-ko.md");
  const blogKoSystem = fillTemplate(blogKoPrompt, {
    topic: args.topic,
    seo_keywords: args.keywords,
    perfectwin_angle: args.angle,
    weekly_intel: args.intel || "없음",
  });
  const blogKo = await callClaude(
    client,
    brandGuide,
    blogKoSystem
  );
  fs.writeFileSync(path.join(weekDir, "blog-ko.md"), blogKo, "utf-8");
  console.log("  -> blog-ko.md saved");

  // ── Step 2: 영문 블로그 ───────────────────────────────────
  console.log("[2/5] Generating English blog...");
  const blogEnPrompt = readFile("prompts/blog-en.md");
  const blogEnSystem = fillTemplate(blogEnPrompt, {
    blog_ko: blogKo,
    seo_keywords: args.keywords,
  });
  const blogEn = await callClaude(
    client,
    brandGuide,
    blogEnSystem
  );
  fs.writeFileSync(path.join(weekDir, "blog-en.md"), blogEn, "utf-8");
  console.log("  -> blog-en.md saved");

  // Extract metadata & build UTM links
  const slug = extractSlug(blogEn) || extractSlug(blogKo);
  const utmLinks = buildUtmLinks(slug);
  const seoMeta = extractMeta(blogKo, blogEn);

  // ── Step 3: LinkedIn 회사 포스트 ──────────────────────────
  console.log("[3/5] Generating LinkedIn company posts...");
  const linkedinCompanyPrompt = readFile("prompts/linkedin-company.md");
  const linkedinCompanySystem = fillTemplate(linkedinCompanyPrompt, {
    blog_content: blogEn,
    blog_url: `https://perfectwin.io/blog/${slug}`,
    utm_params: `utm_source=linkedin-company&utm_medium=social&utm_campaign=${slug}`,
  });
  const linkedinCompany = await callClaude(
    client,
    brandGuide,
    linkedinCompanySystem
  );
  fs.writeFileSync(path.join(weekDir, "linkedin-company.md"), linkedinCompany, "utf-8");
  console.log("  -> linkedin-company.md saved");

  // ── Step 4: LinkedIn 개인 포스트 ──────────────────────────
  console.log("[4/5] Generating LinkedIn personal posts...");
  const linkedinPersonalPrompt = readFile("prompts/linkedin-personal.md");
  const linkedinPersonalSystem = fillTemplate(linkedinPersonalPrompt, {
    blog_content: blogEn,
    blog_url: `https://perfectwin.io/blog/${slug}`,
    utm_params: `utm_source=linkedin-personal&utm_medium=social&utm_campaign=${slug}`,
  });
  const linkedinPersonal = await callClaude(
    client,
    brandGuide,
    linkedinPersonalSystem
  );
  fs.writeFileSync(path.join(weekDir, "linkedin-personal.md"), linkedinPersonal, "utf-8");
  console.log("  -> linkedin-personal.md saved");

  // ── Step 5: X 포스트 ──────────────────────────────────────
  console.log("[5/5] Generating X posts...");
  const xPostsPrompt = readFile("prompts/x-posts.md");
  const xPostsSystem = fillTemplate(xPostsPrompt, {
    blog_content: blogEn,
    blog_url: `https://perfectwin.io/blog/${slug}`,
    utm_params: `utm_source=x-twitter&utm_medium=social&utm_campaign=${slug}`,
  });
  const xPosts = await callClaude(
    client,
    brandGuide,
    xPostsSystem
  );
  fs.writeFileSync(path.join(weekDir, "x-posts.md"), xPosts, "utf-8");
  console.log("  -> x-posts.md saved");

  // ── Save metadata files ───────────────────────────────────
  seoMeta.og = {
    "og:title": seoMeta.en.title || seoMeta.ko.title,
    "og:description": seoMeta.en.metaDescription || seoMeta.ko.metaDescription,
    "og:url": `https://perfectwin.io/blog/${slug}`,
    "og:type": "article",
    "og:site_name": "PerfecTwin",
  };
  fs.writeFileSync(
    path.join(weekDir, "seo-meta.json"),
    JSON.stringify(seoMeta, null, 2),
    "utf-8"
  );
  console.log("  -> seo-meta.json saved");

  fs.writeFileSync(
    path.join(weekDir, "utm-links.json"),
    JSON.stringify(utmLinks, null, 2),
    "utf-8"
  );
  console.log("  -> utm-links.json saved");

  console.log(`\n=== Done! 7 files generated in ${weekDir} ===\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});