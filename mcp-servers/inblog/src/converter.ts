/**
 * Markdown → HTML 변환기 (inblog TipTap 에디터 호환)
 *
 * inblog HTML 규칙:
 * - h1 미지원 → heading을 1단계씩 낮춤 (h1→h2, h2→h3, ...)
 * - 모든 블록 요소에 style="text-align: left" 추가
 * - 링크에 target="_blank" 추가
 * - 이미지는 <figure fig-type="resize"> 래퍼 사용
 * - 리스트 아이템 내부도 <p> 태그로 감쌈
 */

import { marked, type Renderer, type Tokens } from "marked";

let headingCounter = 0;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

const renderer: Partial<Renderer> = {
  heading({ tokens, depth }: Tokens.Heading): string {
    const text = this.parser!.parseInline(tokens);
    const level = Math.min(depth + 1, 6); // h1→h2, h2→h3, ...
    const id = `${slugify(text)}-${headingCounter++}`;
    return `<h${level} style="text-align: left" id="${id}">${text}</h${level}>`;
  },

  paragraph({ tokens }: Tokens.Paragraph): string {
    const text = this.parser!.parseInline(tokens);
    return `<p style="text-align: left">${text}</p>`;
  },

  link({ href, tokens }: Tokens.Link): string {
    const text = this.parser!.parseInline(tokens);
    return `<a target="_blank" href="${href}">${text}</a>`;
  },

  image({ href, title, text }: Tokens.Image): string {
    const alt = text || title || "";
    return `<figure fig-type="resize" style="width: 100%; margin-left: auto; margin-right: auto;"><img src="${href}" alt="${alt}" data-width="100%" data-align="center"></figure>`;
  },

  hr(): string {
    return `<hr>`;
  },

  list({ items, ordered }: Tokens.List): string {
    const tag = ordered ? "ol" : "ul";
    const inner = items.map((item) => this.listitem!(item)).join("");
    return `<${tag}>${inner}</${tag}>`;
  },

  listitem(item: Tokens.ListItem): string {
    const text = this.parser!.parse(item.tokens);
    // If the parsed content doesn't already start with <p, wrap it
    if (text.trimStart().startsWith("<p")) {
      return `<li>${text}</li>`;
    }
    return `<li><p style="text-align: left">${text}</p></li>`;
  },

  strong({ tokens }: Tokens.Strong): string {
    const text = this.parser!.parseInline(tokens);
    return `<strong>${text}</strong>`;
  },

  em({ tokens }: Tokens.Em): string {
    const text = this.parser!.parseInline(tokens);
    return `<em>${text}</em>`;
  },

  br(): string {
    return `<br>`;
  },
};

marked.use({ renderer });

/**
 * Markdown을 inblog 호환 HTML로 변환한다.
 */
export function markdownToHtml(markdown: string): string {
  headingCounter = 0;
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
