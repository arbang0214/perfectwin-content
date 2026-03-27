#!/usr/bin/env node
/**
 * [ARCHIVED] PerfecTwin 블로그 자동 생성 로직
 *
 * 이 파일은 scripts/generate-content.js에서 블로그 자동 생성 부분을 분리한 것이다.
 * 현재 블로그는 ARUM이 Claude 대화로 수동 작성하며,
 * 향후 MCP 서버 기반 발행으로 고도화할 때 참고용으로 보관한다.
 *
 * 원본: scripts/generate-content.js Step 1-2 (한글/영문 블로그 생성)
 * 아카이브 일자: 2026-03-27
 */

const { callClaude, delayBetweenCalls } = require("../scripts/lib/claude-api");
const { loadPrompt, buildPrompt, getSystemPrompt } = require("../scripts/lib/prompts");
const { createWeekFolder, saveContent, readContent, fileExists, todayStamp } = require("../scripts/lib/file-manager");

// ─── 메타데이터 헬퍼 ─────────────────────────────────────
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

/**
 * 블로그 자동 생성 (한글 → 영문)
 * @param {Object} opts - { topic, keywords, angle, intel }
 * @returns {Object} - { blogKo, blogEn, slug, seoMeta }
 */
async function generateBlog(opts) {
  const systemPrompt = getSystemPrompt();
  const stamp = todayStamp();
  const weekDir = createWeekFolder(stamp);

  // Step 1: 한글 블로그
  console.log("[Blog] Generating Korean blog...");
  const blogKo = await callClaude(
    systemPrompt,
    buildPrompt(loadPrompt("blog-ko.md"), {
      topic: opts.topic,
      seo_keywords: opts.keywords,
      perfectwin_angle: opts.angle,
      weekly_intel: opts.intel || "없음",
    })
  );
  saveContent(weekDir, "content", "blog-ko.md", blogKo);
  console.log("  -> content/blog-ko.md saved");
  await delayBetweenCalls();

  // Step 2: 영문 블로그
  console.log("[Blog] Generating English blog...");
  const blogEn = await callClaude(
    systemPrompt,
    buildPrompt(loadPrompt("blog-en.md"), {
      blog_ko: blogKo,
      seo_keywords: opts.keywords,
    })
  );
  saveContent(weekDir, "content", "blog-en.md", blogEn);
  console.log("  -> content/blog-en.md saved");

  const slug = extractSlug(blogEn || blogKo || "") || "weekly-blog";
  const seoMeta = extractMeta(blogKo, blogEn);

  return { blogKo, blogEn, slug, seoMeta, weekDir };
}

module.exports = { generateBlog, extractSlug, extractMeta };
