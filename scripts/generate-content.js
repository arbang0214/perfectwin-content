#!/usr/bin/env node
/**
 * PerfecTwin 주간 콘텐츠 자동 생성 스크립트
 * Usage:
 *   node scripts/generate-content.js \
 *     --topic "주제" --keywords "키워드" --angle "연결 포인트" \
 *     [--intel "트렌드 정보"] [--types "blog-ko,blog-en,..."]
 */

const { callClaude, delayBetweenCalls } = require("./lib/claude-api");
const { loadPrompt, buildPrompt, getSystemPrompt } = require("./lib/prompts");
const { createWeekFolder, saveContent, readContent, fileExists, todayStamp } = require("./lib/file-manager");

// ─── CLI args ────────────────────────────────────────────────
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
    console.error("Usage: node scripts/generate-content.js --topic ... --keywords ... --angle ... [--intel ...] [--types ...]");
    process.exit(1);
  }
  return parsed;
}

// ─── Metadata helpers ────────────────────────────────────────
function extractSlug(content) {
  const match = (content || "").match(/URL\s*(?:슬러그|Slug)\s*\**\s*[:：]\s*`?([a-z0-9][a-z0-9-]+[a-z0-9])`?/im);
  return match ? match[1] : "weekly-blog";
}

function extractMeta(blogKo, blogEn) {
  const extract = (text, field) => {
    const m = (text || "").match(new RegExp(`\\*\\*${field}\\*\\*\\s*[:：]\\s*(.+)`, "i"));
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
  return {
    "linkedin-company": `${base}?utm_source=linkedin-company&utm_medium=social&utm_campaign=${slug}`,
    "linkedin-personal": `${base}?utm_source=linkedin-personal&utm_medium=social&utm_campaign=${slug}`,
    "x-twitter": `${base}?utm_source=x-twitter&utm_medium=social&utm_campaign=${slug}`,
    "blog-ko": `${base}?utm_source=blog-ko&utm_medium=blog&utm_campaign=${slug}`,
    "blog-en": `${base}?utm_source=blog-en&utm_medium=blog&utm_campaign=${slug}`,
    "email-sig": `${base}?utm_source=email-sig&utm_medium=email&utm_campaign=${slug}`,
  };
}

// ─── Main pipeline ───────────────────────────────────────────
async function main() {
  const args = parseArgs();
  const systemPrompt = getSystemPrompt();

  const stamp = todayStamp();
  const weekDir = createWeekFolder(stamp);

  // Determine effective types (with dependency resolution)
  const ALL_TYPES = ["blog-ko", "blog-en", "linkedin-company", "linkedin-personal", "x-posts", "img-blog-thumbnail", "img-linkedin-company"];
  const selectedTypes = args.types
    ? new Set(args.types.split(",").map((t) => t.trim()))
    : new Set(ALL_TYPES);

  const effectiveTypes = new Set(selectedTypes);
  const needsSocial = ["linkedin-company", "linkedin-personal", "x-posts"].some((t) => effectiveTypes.has(t));
  if (effectiveTypes.has("img-linkedin-company") && !fileExists(weekDir, "content", "linkedin-company.md")) {
    effectiveTypes.add("linkedin-company");
  }
  if ((needsSocial || effectiveTypes.has("linkedin-company")) && !fileExists(weekDir, "content", "blog-en.md")) {
    effectiveTypes.add("blog-en");
  }
  if (effectiveTypes.has("blog-en") && !fileExists(weekDir, "content", "blog-ko.md")) {
    effectiveTypes.add("blog-ko");
  }
  const gen = (type) => effectiveTypes.has(type);

  console.log(`\n=== PerfecTwin Content Generator ===`);
  console.log(`Topic: ${args.topic}`);
  console.log(`Types: ${args.types || "all"}`);
  console.log(`Output: ${weekDir}\n`);

  // ── Step 1: 한글 블로그 ──────────────────────────────────
  let blogKo = null;
  if (gen("blog-ko")) {
    console.log("[1/5] Generating Korean blog...");
    blogKo = await callClaude(
      systemPrompt,
      buildPrompt(loadPrompt("blog-ko.md"), {
        topic: args.topic,
        seo_keywords: args.keywords,
        perfectwin_angle: args.angle,
        weekly_intel: args.intel || "없음",
      })
    );
    saveContent(weekDir, "content", "blog-ko.md", blogKo);
    console.log("  -> content/blog-ko.md saved");
    await delayBetweenCalls();
  } else {
    console.log("[1/5] Skipping Korean blog");
    blogKo = readContent(weekDir, "content", "blog-ko.md");
    if (blogKo) console.log("  -> using existing content/blog-ko.md");
  }

  // ── Step 2: 영문 블로그 ──────────────────────────────────
  let blogEn = null;
  if (gen("blog-en")) {
    console.log("[2/5] Generating English blog...");
    if (!blogKo) {
      console.log("  -> Skipped: blog-ko.md not available");
    } else {
      blogEn = await callClaude(
        systemPrompt,
        buildPrompt(loadPrompt("blog-en.md"), {
          blog_ko: blogKo,
          seo_keywords: args.keywords,
        })
      );
      saveContent(weekDir, "content", "blog-en.md", blogEn);
      console.log("  -> content/blog-en.md saved");
      await delayBetweenCalls();
    }
  } else {
    console.log("[2/5] Skipping English blog");
    blogEn = readContent(weekDir, "content", "blog-en.md");
    if (blogEn) console.log("  -> using existing content/blog-en.md");
  }

  const slug = extractSlug(blogEn || blogKo || "") || "weekly-blog";
  const blogUrl = `https://perfectwin.io/blog/${slug}`;
  const utmLinks = buildUtmLinks(slug);
  const seoMeta = extractMeta(blogKo || "", blogEn || "");

  // ── Step 3: LinkedIn + X 포스트 (병렬) ───────────────────
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
        socialTasks.push(callClaude(systemPrompt, buildPrompt(loadPrompt("linkedin-company.md"), {
          blog_content: blogEn, blog_url: blogUrl,
          utm_params: `utm_source=linkedin-company&utm_medium=social&utm_campaign=${slug}`,
        })));
      }
      if (gen("linkedin-personal")) {
        socialKeys.push("linkedin-personal");
        socialTasks.push(callClaude(systemPrompt, buildPrompt(loadPrompt("linkedin-personal.md"), {
          blog_content: blogEn, blog_url: blogUrl,
          utm_params: `utm_source=linkedin-personal&utm_medium=social&utm_campaign=${slug}`,
        })));
      }
      if (gen("x-posts")) {
        socialKeys.push("x-posts");
        socialTasks.push(callClaude(systemPrompt, buildPrompt(loadPrompt("x-posts.md"), {
          blog_content: blogEn, blog_url: blogUrl,
          utm_params: `utm_source=x-twitter&utm_medium=social&utm_campaign=${slug}`,
        })));
      }

      const results = await Promise.all(socialTasks);
      socialKeys.forEach((key, i) => {
        if (key === "linkedin-company") {
          linkedinCompany = results[i];
          saveContent(weekDir, "content", "linkedin-company.md", results[i]);
          console.log("  -> content/linkedin-company.md saved");
        } else if (key === "linkedin-personal") {
          saveContent(weekDir, "content", "linkedin-personal.md", results[i]);
          console.log("  -> content/linkedin-personal.md saved");
        } else if (key === "x-posts") {
          saveContent(weekDir, "content", "x-posts.md", results[i]);
          console.log("  -> content/x-posts.md saved");
        }
      });
      await delayBetweenCalls();
    }
  }

  if (!linkedinCompany) {
    linkedinCompany = readContent(weekDir, "content", "linkedin-company.md");
  }

  // ── Step 4: 이미지 프롬프트 ──────────────────────────────
  const imgSelected = ["img-blog-thumbnail", "img-linkedin-company"].filter(gen);
  console.log(`[4/5] ${imgSelected.length ? "Generating image prompts..." : "Skipping image prompts"}`);

  if (imgSelected.length > 0) {
    const blogTitle = seoMeta.en.title || seoMeta.ko.title || args.topic;
    const topicSummary = `${args.topic} — ${args.angle}`;
    const imgTasks = [];
    const imgKeys = [];

    if (gen("img-blog-thumbnail")) {
      imgKeys.push("blog-thumbnail");
      imgTasks.push(callClaude(systemPrompt, buildPrompt(loadPrompt("image-blog-thumbnail.md"), {
        blog_title_en: blogTitle,
        blog_title_ko: seoMeta.ko.title || args.topic,
        topic_summary: topicSummary,
      })));
    }
    if (gen("img-linkedin-company") && linkedinCompany) {
      imgKeys.push("linkedin-images");
      imgTasks.push(callClaude(systemPrompt, buildPrompt(loadPrompt("image-linkedin.md"), {
        linkedin_content: linkedinCompany,
        blog_title_en: blogTitle,
        topic_summary: topicSummary,
      })));
    }

    if (imgTasks.length > 0) {
      const imgResults = await Promise.all(imgTasks);
      imgKeys.forEach((key, i) => {
        if (key === "blog-thumbnail") {
          saveContent(weekDir, "image-prompts", "blog-thumbnail.md", imgResults[i]);
          console.log("  -> image-prompts/blog-thumbnail.md saved");
        } else if (key === "linkedin-images") {
          saveContent(weekDir, "image-prompts", "linkedin-images.md", imgResults[i]);
          console.log("  -> image-prompts/linkedin-images.md saved");
        }
      });
    }
  }

  // ── Step 5: 메타데이터 + Summary (항상 생성) ────────────
  console.log("[5/5] Generating summary & metadata...");

  seoMeta.og = {
    "og:title": seoMeta.en.title || seoMeta.ko.title,
    "og:description": seoMeta.en.metaDescription || seoMeta.ko.metaDescription,
    "og:url": blogUrl,
    "og:type": "article",
    "og:site_name": "PerfecTwin",
  };
  saveContent(weekDir, "meta", "seo-meta.json", JSON.stringify(seoMeta, null, 2));
  console.log("  -> meta/seo-meta.json saved");

  saveContent(weekDir, "meta", "utm-links.json", JSON.stringify(utmLinks, null, 2));
  console.log("  -> meta/utm-links.json saved");

  const utmSummary = Object.entries(utmLinks).map(([k, v]) => `- **${k}**: ${v}`).join("\n");
  const summaryMd = `# Weekly Content Summary — ${stamp}\n\n## Topic\n${args.topic}\n\n## Blog\n- **Slug**: ${slug}\n- **URL**: ${blogUrl}\n- **SEO Keywords**: ${args.keywords}\n\n## Generated Files\n\n### Content\n- [ ] blog-ko.md — Korean blog post\n- [ ] blog-en.md — English blog post\n- [ ] linkedin-company.md — LinkedIn company posts (2)\n- [ ] linkedin-personal.md — LinkedIn personal posts (2)\n- [ ] x-posts.md — X/Twitter posts (5) + thread (1)\n\n### Image Prompts\n- [ ] blog-thumbnail.md — Blog OG image prompt\n- [ ] linkedin-images.md — LinkedIn image prompts (2)\n\n### Meta\n- [ ] seo-meta.json — SEO metadata & OG tags\n- [ ] utm-links.json — UTM tracking links\n\n## Publishing Checklist\n\n### Blog\n- [ ] Review blog-ko.md (Korean)\n- [ ] Review blog-en.md (English)\n- [ ] Generate thumbnail image\n- [ ] Publish to Framer CMS\n\n### LinkedIn Company\n- [ ] Review Post A + Post B\n- [ ] Create images (linkedin-images.md)\n- [ ] Schedule via Buffer\n\n### LinkedIn Personal (ARUM)\n- [ ] Review Post A + Post B\n- [ ] Schedule via Buffer\n\n### X (Twitter)\n- [ ] Review 5 standalone posts\n- [ ] Review thread\n- [ ] Schedule via Buffer\n\n## UTM Links\n${utmSummary}\n`;

  saveContent(weekDir, null, "summary.md", summaryMd);
  console.log("  -> summary.md saved");

  console.log(`\n=== Done! Files generated in ${weekDir} ===\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
