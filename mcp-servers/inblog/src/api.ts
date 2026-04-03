/**
 * inblog REST API 클라이언트
 * JSON:API 형식으로 통신한다.
 */

const API_BASE = process.env.INBLOG_API_BASE || "https://inblog.ai/api/v1";

export type BlogLang = "ko" | "en";

function getApiKey(lang: BlogLang): string {
  if (lang === "ko") return process.env.INBLOG_API_KEY_KO || process.env.INBLOG_API_KEY || "";
  return process.env.INBLOG_API_KEY_EN || process.env.INBLOG_API_KEY || "";
}

function getBlogUrl(lang: BlogLang): string {
  if (lang === "ko") return process.env.INBLOG_BLOG_URL_KO || "https://ko.blog.perfectwin.ai";
  return process.env.INBLOG_BLOG_URL_EN || "https://blog.perfectwin.ai";
}

interface PostAttributes {
  title: string;
  slug: string;
  description?: string;
  content_html?: string;
  published?: boolean;
  image?: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface PostData {
  id: string;
  type: string;
  attributes: PostAttributes;
}

interface ApiResponse {
  jsonapi: { version: string };
  data: PostData | PostData[];
  meta?: { total: number; page: number; limit: number; totalPages: number };
}

async function apiRequest(
  path: string,
  lang: BlogLang,
  method: string = "GET",
  body?: unknown
): Promise<ApiResponse> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey(lang)}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`inblog API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }

  return (await res.json()) as ApiResponse;
}

/**
 * 포스트 목록 조회
 */
export async function listPosts(
  lang: BlogLang,
  page: number = 1,
  perPage: number = 20,
  published?: boolean
): Promise<{ posts: PostData[]; meta: ApiResponse["meta"] }> {
  let path = `/posts?page=${page}&limit=${perPage}`;
  if (published !== undefined) {
    path += `&filter[published]=${published}`;
  }
  const res = await apiRequest(path, lang);
  const posts = Array.isArray(res.data) ? res.data : [res.data];
  return { posts, meta: res.meta };
}

/**
 * 포스트 단건 조회
 */
export async function getPost(lang: BlogLang, postId: string): Promise<PostData> {
  const res = await apiRequest(`/posts/${postId}`, lang);
  return res.data as PostData;
}

/**
 * 포스트 생성 (Draft)
 */
export async function createPost(lang: BlogLang, attrs: {
  title: string;
  slug: string;
  description?: string;
  content_html: string;
  image?: string;
}): Promise<PostData> {
  const res = await apiRequest("/posts", lang, "POST", {
    jsonapi: { version: "1.0" },
    data: {
      type: "posts",
      attributes: {
        title: attrs.title,
        slug: attrs.slug,
        description: attrs.description || "",
        content_html: attrs.content_html,
        published: false,
        ...(attrs.image ? { image: attrs.image } : {}),
      },
    },
  });
  return res.data as PostData;
}

/**
 * 포스트 수정
 */
export async function updatePost(
  lang: BlogLang,
  postId: string,
  attrs: {
    title?: string;
    slug?: string;
    description?: string;
    content_html?: string;
    image?: string;
  }
): Promise<PostData> {
  const res = await apiRequest(`/posts/${postId}`, lang, "PATCH", {
    jsonapi: { version: "1.0" },
    data: {
      type: "posts",
      id: postId,
      attributes: attrs,
    },
  });
  return res.data as PostData;
}

/**
 * 포스트 발행/취소
 */
export async function publishPost(
  lang: BlogLang,
  postId: string,
  action: "publish" | "unpublish" = "publish"
): Promise<void> {
  await apiRequest(`/posts/${postId}/publish`, lang, "PATCH", {
    jsonapi: { version: "1.0" },
    data: {
      type: "publish_action",
      attributes: { action },
    },
  });
}

/**
 * 포스트 URL 생성
 */
export function getPostUrl(lang: BlogLang, slug: string): string {
  return `${getBlogUrl(lang)}/${slug}`;
}
