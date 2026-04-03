/**
 * inblog REST API 클라이언트
 * JSON:API 형식으로 통신한다.
 */

const API_BASE = process.env.INBLOG_API_BASE || "https://inblog.ai/api/v1";
const API_KEY = process.env.INBLOG_API_KEY || "";
const BLOG_URL = process.env.INBLOG_BLOG_URL || "https://blog.perfectwin.ai";

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
  cta_text?: string;
  cta_link?: string;
  cta_color?: string;
  cta_text_color?: string;
}

interface Relationship {
  data: { type: string; id: string }[];
}

interface PostData {
  id: string;
  type: string;
  attributes: PostAttributes;
  relationships?: {
    tags?: Relationship;
    authors?: Relationship;
  };
}

interface ApiResponse {
  jsonapi: { version: string };
  data: PostData | PostData[];
  meta?: { total: number; page: number; limit: number; totalPages: number };
}

async function apiRequest(
  path: string,
  method: string = "GET",
  body?: unknown
): Promise<ApiResponse> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${API_KEY}`,
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
  page: number = 1,
  perPage: number = 20,
  published?: boolean
): Promise<{ posts: PostData[]; meta: ApiResponse["meta"] }> {
  let path = `/posts?page=${page}&limit=${perPage}`;
  if (published !== undefined) {
    path += `&filter[published]=${published}`;
  }
  const res = await apiRequest(path);
  const posts = Array.isArray(res.data) ? res.data : [res.data];
  return { posts, meta: res.meta };
}

/**
 * 포스트 단건 조회
 */
export async function getPost(postId: string): Promise<PostData> {
  const res = await apiRequest(`/posts/${postId}`);
  return res.data as PostData;
}

/**
 * 포스트 생성 (Draft)
 */
export async function createPost(attrs: {
  title: string;
  slug: string;
  description?: string;
  content_html: string;
  image?: string;
  cta_text?: string;
  cta_link?: string;
  cta_color?: string;
  cta_text_color?: string;
  tag_ids?: string[];
  author_ids?: string[];
}): Promise<PostData> {
  const relationships: Record<string, Relationship> = {};
  if (attrs.tag_ids?.length) {
    relationships.tags = { data: attrs.tag_ids.map((id) => ({ type: "tags", id })) };
  }
  if (attrs.author_ids?.length) {
    relationships.authors = { data: attrs.author_ids.map((id) => ({ type: "authors", id })) };
  }

  const res = await apiRequest("/posts", "POST", {
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
        ...(attrs.cta_text ? { cta_text: attrs.cta_text } : {}),
        ...(attrs.cta_link ? { cta_link: attrs.cta_link } : {}),
        ...(attrs.cta_color ? { cta_color: attrs.cta_color } : {}),
        ...(attrs.cta_text_color ? { cta_text_color: attrs.cta_text_color } : {}),
      },
      ...(Object.keys(relationships).length ? { relationships } : {}),
    },
  });
  return res.data as PostData;
}

/**
 * 포스트 수정
 */
export async function updatePost(
  postId: string,
  attrs: {
    title?: string;
    slug?: string;
    description?: string;
    content_html?: string;
    image?: string;
  }
): Promise<PostData> {
  const res = await apiRequest(`/posts/${postId}`, "PATCH", {
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
  postId: string,
  action: "publish" | "unpublish" = "publish"
): Promise<void> {
  await apiRequest(`/posts/${postId}/publish`, "PATCH", {
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
export function getPostUrl(slug: string): string {
  return `${BLOG_URL}/${slug}`;
}
