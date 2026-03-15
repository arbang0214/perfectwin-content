#!/usr/bin/env node

/**
 * PerfecTwin 주간 콘텐츠 자동 생성 스크립트
 *
 * Usage:
 *   node scripts/generate-content.js \
 *     --topic "S/4HANA 마이그레이션 테스트 실패 Top 5" \
 *     --keywords "S/4HANA migration testing, SAP regression testing automation" \
 *     --angle "PerfecTwin의 Pre-built 템플릿으로 마이그레이션 테스트 커버리지 확보" \
 *     [--types "blog-ko,blog-en,linkedin-company,linkedin-personal,x-posts,img-blog-thumbnail,img-linkedin-company"]
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
    else if (args[i] === "--types" && args[i + 1]) parsed.types = args[++i];
  }
  if (!parsed.topic || !parsed.keywords || !parsed.angle) {
    console.error(`
Usage:
  node scripts/generate-content.js \\
    --topic "주제" \\
    --keywords "키워드1, 키워드2" \\
    --angle "PerfecTwin 연결 포인트" \\
    [--intel "참고 데이터/트렌드 (선택)"] \\
    [--types "blog-ko,blog-en,linkedin-company,linkedin-personal,x-posts,img-blog-thumbnail,img-linkedin-company"]
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

function readExisting(filePath) {
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8");
  return null;
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Claude API call ────────────────────────────────────────
async function callClaude(client, systemPrompt, userMessage) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
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
  const stamp = todayStamp();
  const weekDir = path.join(ROOT, "output", `week-${stamp}`);
  const contentDir = path.join(weekDir, "content");
  const imagePromptsDir = path.join(weekDir, "image-prompts");
  const metaDir = path.join(weekDir, "meta");

  ensureDir(contentDir);
  ensureDir(imagePromptsDir);
  ensureDir(metaDir);

  // Determine which types to generate
  const ALL_TYPES = [
    "blog-ko", "blog-en",
    "linkedin-company", "linkedin-personal", "x-posts",
    "img-blog-thumbnail", "img-linkedin-company",
  ];
  const selectedTypes = args.types
    ? new Set(args.types.split(",").map((t) => t.trim()))
    : new Set(ALL_TYPES);

  // Auto-resolve dependencies (only if dependency file doesn't already exist on disk)
  const effectiveTypes = new Set(selectedTypes);
  const needsSocial = ["linkedin-company", "linkedin-personal", "x-posts"].some((t) => effectiveTypes.has(t));
  if (effectiveTypes.has("img-linkedin-company") && !fs.existsSync(path.join(contentDir, "linkedin-company.md"))) {
    effectiveTypes.add("linkedin-company");
  }
  if ((needsSocial || effectiveTypes.has("linkedin-company")) && !fs.existsSync(path.join(contentDir, "blog-en.md"))) {
    effectiveTypes.add("blog-en");
  }
  if (effectiveTypes.has("blog-en") && !fs.existsSync(path.join(contentDir, "blog-ko.md"))) {
    effectiveTypes.add("blog-ko");
  }

  const gen = (type) => effectiveTypes.has(type);

  console.log(`\n=== PerfecTwin Content Generator ===`);
  console.log(`Topic: ${args.topic}`);
  console.log(`Types: ${args.types || "all"}`);
  console.log(`Output: ${weekDir}\n`);

  // ── Step 1: 한글 블로그 ───────────────────────────────────
  let blogKo = null;
  if (gen("blog-ko")) {
    console.log("[1/5] Generating Korean blog...");
    const blogKoSystem = fillTemplate(readFile("prompts/blog-ko.md"), {
      topic: args.topic,
      seo_keywords: args.keywords,
      perfectwin_angle: args.angle,
      weekly_intel: args.intel || "없음",
    });
    blogKo = await callClaude(client, brandGuide, blogKoSystem);
    fs.writeFileSync(path.join(contentDir, "blog-ko.md"), blogKo, "utf-8");
    console.log("  -> content/blog-ko.md saved");
    await delay(5000);
  } else {
    console.log("[1/5] Skipping Korean blog");
    blogKo = readExisting(path.join(contentDir, "blog-ko.md"));
    if (blogKo) console.log("  -> using existing content/blog-ko.md");
  }

  // ── Step 2: 영문 블로그 ───────────────────────────────────
  let blogEn = null;
  if (gen("blog-en")) {
    console.log("[2/5] Generating English blog...");
    if (!blogKo) {
      console.log("  -> Skipped: blog-ko.md not available");
    } else {
      const blogEnSystem = fillTemplate(readFile("prompts/blog-en.md"), {
        blog_ko: blogKo,
        seo_keywords: args.keywords,
      });
      blogEn = await callClaude(client, brandGuide, blogEnSystem);
      fs.writeFileSync(path.join(contentDir, "blog-en.md"), blogEn, "utf-8");
      console.log("  -> content/blog-en.md saved");
      await delay(5000);
    }
  } else {
    console.log("[2/5] Skipping English blog");
    blogEn = readExisting(path.join(contentDir, "blog-en.md"));
    if (blogEn) console.log("  -> using existing content/blog-en.md");
  }

  // Extract metadata from available content
  const slug = extractSlug((blogEn || blogKo || "")) || "weekly-blog";
  const utmLinks = buildUtmLinks(slug);
  const seoMeta = extractMeta(blogKo || "", blogEn || "");
  const blogUrl = `https://perfectwin.io/blog/${slug}`;

  // ── Step 3: LinkedIn + X 포스트 (병렬 실행) ─────────────
  const socialSelected = ["linkedin-company", "linkedin-personal", "x-posts"].filter(gen);
  console.log(`[3/5] ${socialSelected.length ? `Generating social posts (${socialSelected.join(", ")})...` : "Skipping social posts"}`);

  let linkedinCompany = null;

  if (socialSelected.length > 0) {
    if (!blogEn) {
      console.log("  -> Skipped: blog-en.md not available");
    } else {
      const socialTasks = [];
      const socialKeys = [];

      if (gen("linkedin-company")) {
        socialKeys.push("linkedin-company");
        socialTasks.push(callClaude(client, brandGuide, fillTemplate(readFile("prompts/linkedin-company.md"), {
          blog_content: blogEn,
          blog_url: blogUrl,
          utm_params: `utm_source=linkedin-company&utm_medium=social&utm_campaign=${slug}`,
        })));
      }
      if (gen("linkedin-personal")) {
        socialKeys.push("linkedin-personal");
        socialTasks.push(callClaude(client, brandGuide, fillTemplate(readFile("prompts/linkedin-personal.md"), {
          blog_content: blogEn,
          blog_url: blogUrl,
          utm_params: `utm_source=linkedin-personal&utm_medium=social&utm_campaign=${slug}`,
        })));
      }
      if (gen("x-posts")) {
        socialKeys.push("x-posts");
        socialTasks.push(callClaude(client, brandGuide, fillTemplate(readFile("prompts/x-posts.md"), {
          blog_content: blogEn,
          blog_url: blogUrl,
          utm_params: `utm_source=x-twitter&utm_medium=social&utm_campaign=${slug}`,
        })));
      }

      const socialResults = await Promise.all(socialTasks);
      socialKeys.forEach((key, i) => {
        const result = socialResults[i];
        if (key === "linkedin-company") {
          linkedinCompany = result;
          fs.writeFileSync(path.join(contentDir, "linkedin-company.md"), result, "utf-8");
          console.log("  -> content/linkedin-company.md saved");
        } else if (key === "linkedin-personal") {
          fs.writeFileSync(path.join(contentDir, "linkedin-personal.md"), result, "utf-8");
          console.log("  -> content/linkedin-personal.md saved");
        } else if (key === "x-posts") {
          fs.writeFileSync(path.join(contentDir, "x-posts.md"), result, "utf-8");
          console.log("  -> content/x-posts.md saved");
        }
      });

      await delay(5000);
    }
  }

  // Read existing linkedin-company if not just generated (needed for image prompt)
  if (!linkedinCompany) {
    linkedinCompany = readExisting(path.join(contentDir, "linkedin-company.md"));
  }

  // ── Step 4: 이미지 프롬프트 생성 ──────────────────────────
  const imgSelected = ["img-blog-thumbnail", "img-linkedin-company"].filter(gen);
  console.log(`[4/5] ${imgSelected.length ? "Generating image prompts..." : "Skipping image prompts"}`);

  if (imgSelected.length > 0) {
    const blogTitle = seoMeta.en.title || seoMeta.ko.title || args.topic;
    const topicSummary = `${args.topic} — ${args.angle}`;
    const imgTasks = [];
    const imgKeys = [];

    if (gen("img-blog-thumbnail")) {
      imgKeys.push("blog-thumbnail");
      imgTasks.push(callClaude(client, brandGuide, fillTemplate(readFile("prompts/image-blog-thumbnail.md"), {
        blog_title_en: blogTitle,
        blog_title_ko: seoMeta.ko.title || args.topic,
        topic_summary: topicSummary,
      })));
    }

    if (gen("img-linkedin-company")) {
      if (!linkedinCompany) {
        console.log("  -> Skipping linkedin image prompt: linkedin-company.md not available");
      } else {
        imgKeys.push("linkedin-images");
        imgTasks.push(callClaude(client, brandGuide, fillTemplate(readFile("prompts/image-linkedin.md"), {
          linkedin_content: linkedinCompany,
          blog_title_en: blogTitle,
          topic_summary: topicSummary,
        })));
      }
    }

    if (imgTasks.length > 0) {
      const imgResults = await Promise.all(imgTasks);
      imgKeys.forEach((key, i) => {
        const result = imgResults[i];
        if (key === "blog-thumbnail") {
          fs.writeFileSync(path.join(imagePromptsDir, "blog-thumbnail.md"), result, "utf-8");
          console.log("  -> image-prompts/blog-thumbnail.md saved");
        } else if (key === "linkedin-images") {
          fs.writeFileSync(path.join(imagePromptsDir, "linkedin-images.md"), result, "utf-8");
          console.log("  -> image-prompts/linkedin-images.md saved");
        }
      });
    }
  }

  // ── Step 5: Metadata + Summary (항상 생성) ────────────────
  console.log("[5/5] Generating summary & metadata...");

  seoMeta.og = {
    "og:title": seoMeta.en.title || seoMeta.ko.title,
    "og:description": seoMeta.en.metaDescription || seoMeta.ko.metaDescription,
    "og:url": `https://perfectwin.io/blog/${slug}`,
    "og:type": "article",
    "og:site_name": "PerfecTwin",
  };
  fs.writeFileSync(path.join(metaDir, "seo-meta.json"), JSON.stringify(seoMeta, null, 2), "utf-8");
  console.log("  -> meta/seo-meta.json saved");

  fs.writeFileSync(path.join(metaDir, "utm-links.json"), JSON.stringify(utmLinks, null, 2), "utf-8");
  console.log("  -> meta/utm-links.json saved");

  const utmSummary = Object.entries(utmLinks)
    .map(([key, url]) => `- **${key}**: ${url}`)
    .join("\n");

  const summaryMd = `# Weekly Content Summary — ${stamp}

## Topic
${args.topic}

## Blog
- **Slug**: ${slug}
- **URL**: https://perfectwin.io/blog/${slug}
- **SEO Keywords**: ${args.keywords}

## Generated Files

### Content
- [ ] blog-ko.md — Korean blog post
- [ ] blog-en.md — English blog post
- [ ] linkedin-company.md — LinkedIn company posts (2)
- [ ] linkedin-personal.md — LinkedIn personal posts (2)
- [ ] x-posts.md — X/Twitter standalone posts (5) + thread (1)

### Image Prompts
- [ ] blog-thumbnail.md — Blog OG image prompt
- [ ] linkedin-images.md — LinkedIn post image prompts (2)

### Meta
- [ ] seo-meta.json — SEO metadata & OG tags
- [ ] utm-links.json — UTM tracking links

## Publishing Checklist

### Blog
- [ ] Review blog-ko.md (Korean)
- [ ] Review blog-en.md (English)
- [ ] Generate blog thumbnail image (use blog-thumbnail.md prompt)
- [ ] Publish to Framer CMS
- [ ] Verify OG tags

### LinkedIn Company
- [ ] Review linkedin-company.md Post A
- [ ] Review linkedin-company.md Post B
- [ ] Create/generate images (use linkedin-images.md)
- [ ] Schedule via Buffer (Post A: Tue, Post B: Thu)

### LinkedIn Personal (ARUM)
- [ ] Review linkedin-personal.md Post A
- [ ] Review linkedin-personal.md Post B
- [ ] Schedule via Buffer (Post A: Wed, Post B: Fri)

### X (Twitter)
- [ ] Review x-posts.md standalone posts (5)
- [ ] Review x-posts.md thread
- [ ] Schedule via Buffer (Mon–Fri, 1 per day)
- [ ] Schedule thread (Tue or Thu)

## UTM Links
${utmSummary}
`;

  fs.writeFileSync(path.join(weekDir, "summary.md"), summaryMd, "utf-8");
  console.log("  -> summary.md saved");

  console.log(`\n=== Done! Files generated in ${weekDir} ===\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});