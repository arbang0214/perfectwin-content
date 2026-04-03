/**
 * Markdown → HTML 변환기
 * inblog은 h1을 미지원하므로 heading을 1단계씩 낮춤 (h1→h2, h2→h3, ...)
 */

import { marked, type Renderer, type Tokens } from "marked";

const renderer: Partial<Renderer> = {
  heading({ tokens, depth }: Tokens.Heading): string {
    const text = this.parser!.parseInline(tokens);
    const level = Math.min(depth + 1, 6); // h1→h2, h2→h3, ...
    return `<h${level}>${text}</h${level}>\n`;
  },
};

marked.use({ renderer });

/**
 * Markdown을 HTML로 변환한다 (heading 다운그레이드 포함).
 */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

/**
 * 제목에서 URL 슬러그를 자동 생성한다.
 * 영어+숫자만 추출 → 소문자 → 공백/특수문자를 하이픈으로 → 연속 하이픈 제거 → 최대 100자
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}
