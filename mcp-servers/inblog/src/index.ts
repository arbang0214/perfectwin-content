#!/usr/bin/env node
/**
 * inblog MCP Server
 * Claude Code에서 inblog 블로그 발행을 직접 수행할 수 있게 한다.
 * 한글(ko) / 영어(en) 블로그를 language 파라미터로 구분한다.
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { listPosts, createPost, updatePost, publishPost, getPostUrl } from "./api.js";
import type { BlogLang } from "./api.js";
import { markdownToHtml, generateSlug } from "./converter.js";

const server = new McpServer({
  name: "inblog-mcp-server",
  version: "1.1.0",
});

const langSchema = z.enum(["ko", "en"]).describe("블로그 언어: ko(한글) 또는 en(영어)");

// ─── Tool 1: 포스트 목록 조회 ──────────────────────────────

server.registerTool(
  "inblog_list_posts",
  {
    title: "inblog 포스트 목록 조회",
    description: "기존 블로그 포스트 목록을 조회한다. 발행/Draft 필터 가능.",
    inputSchema: {
      language: langSchema,
      page: z.number().optional().describe("페이지 번호 (기본 1)"),
      per_page: z.number().optional().describe("페이지당 개수 (기본 20)"),
      published: z.boolean().optional().describe("true=발행됨, false=Draft, 미지정=전체"),
    },
  },
  async ({ language, page, per_page, published }) => {
    try {
      const lang = language as BlogLang;
      const { posts, meta } = await listPosts(lang, page ?? 1, per_page ?? 20, published);
      const list = posts.map((p) => ({
        id: p.id,
        title: p.attributes.title,
        slug: p.attributes.slug,
        published: p.attributes.published,
        url: p.attributes.published ? getPostUrl(lang, p.attributes.slug) : null,
        published_at: p.attributes.published_at,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ language: lang, posts: list, meta }, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `오류: ${message}` }], isError: true };
    }
  }
);

// ─── Tool 2: 포스트 생성 ───────────────────────────────────

server.registerTool(
  "inblog_create_post",
  {
    title: "inblog 포스트 생성",
    description:
      "새 블로그 포스트를 생성한다. Markdown 본문을 자동으로 HTML 변환. publish_immediately=true면 바로 발행.",
    inputSchema: {
      language: langSchema,
      title: z.string().describe("포스트 제목"),
      content_markdown: z.string().describe("Markdown 본문"),
      slug: z.string().optional().describe("URL 슬러그 (미지정 시 제목에서 자동 생성)"),
      description: z.string().optional().describe("SEO 설명"),
      image_url: z.string().optional().describe("대표 이미지 URL 또는 data:image base64"),
      publish_immediately: z.boolean().optional().describe("true면 생성 후 바로 발행"),
    },
  },
  async ({ language, title, content_markdown, slug, description, image_url, publish_immediately }) => {
    try {
      const lang = language as BlogLang;
      const contentHtml = markdownToHtml(content_markdown);
      const postSlug = slug || generateSlug(title);

      const post = await createPost(lang, {
        title,
        slug: postSlug,
        description,
        content_html: contentHtml,
        image: image_url,
      });

      let status = "draft";
      if (publish_immediately) {
        await publishPost(lang, post.id);
        status = "published";
      }

      const url = getPostUrl(lang, postSlug);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                language: lang,
                post_id: post.id,
                slug: postSlug,
                status,
                url: status === "published" ? url : `${url} (draft)`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `오류: ${message}` }], isError: true };
    }
  }
);

// ─── Tool 3: 포스트 수정 ───────────────────────────────────

server.registerTool(
  "inblog_update_post",
  {
    title: "inblog 포스트 수정",
    description: "기존 포스트를 수정한다. content_markdown 제공 시 HTML 변환 후 업데이트.",
    inputSchema: {
      language: langSchema,
      post_id: z.string().describe("수정할 포스트 ID"),
      title: z.string().optional().describe("새 제목"),
      content_markdown: z.string().optional().describe("새 Markdown 본문"),
      slug: z.string().optional().describe("새 슬러그"),
      description: z.string().optional().describe("새 SEO 설명"),
      image_url: z.string().optional().describe("새 대표 이미지 URL"),
    },
  },
  async ({ language, post_id, title, content_markdown, slug, description, image_url }) => {
    try {
      const lang = language as BlogLang;
      const attrs: Record<string, string> = {};
      if (title) attrs.title = title;
      if (slug) attrs.slug = slug;
      if (description) attrs.description = description;
      if (image_url) attrs.image = image_url;
      if (content_markdown) attrs.content_html = markdownToHtml(content_markdown);

      const post = await updatePost(lang, post_id, attrs);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                language: lang,
                post_id: post.id,
                title: post.attributes.title,
                slug: post.attributes.slug,
                url: getPostUrl(lang, post.attributes.slug),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `오류: ${message}` }], isError: true };
    }
  }
);

// ─── Tool 4: 포스트 발행/취소 ──────────────────────────────

server.registerTool(
  "inblog_publish_post",
  {
    title: "inblog 포스트 발행/취소",
    description: "Draft → 발행 또는 발행 취소.",
    inputSchema: {
      language: langSchema,
      post_id: z.string().describe("포스트 ID"),
      action: z
        .enum(["publish", "unpublish"])
        .optional()
        .describe("publish(기본) 또는 unpublish"),
    },
  },
  async ({ language, post_id, action }) => {
    try {
      const lang = language as BlogLang;
      const act = action ?? "publish";
      await publishPost(lang, post_id, act);

      if (act === "publish") {
        const { posts } = await listPosts(lang, 1, 100, true);
        const found = posts.find((p) => p.id === post_id);
        const url = found ? getPostUrl(lang, found.attributes.slug) : "(URL 확인 필요)";
        return {
          content: [{ type: "text" as const, text: `발행 완료 (${lang}): ${url}` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: `발행 취소 완료 (${lang}, post_id: ${post_id})` }],
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `오류: ${message}` }], isError: true };
    }
  }
);

// ─── 서버 시작 ─────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("inblog MCP server started (v1.1.0 — ko/en dual blog support)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
