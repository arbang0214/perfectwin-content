'use strict';

// Brand colors
const COLORS = {
  navy:      '#1E3A5F',
  terracotta:'#C4603A',
  sage:      '#6B8F71',
  cream:     '#FAF7F2',
  lightBlue: '#E8F3FC',
  white:     '#FFFFFF',
  dark:      '#1a2035',
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Slide background theme based on position.
 * Slide 1, last → navy
 * Even middle → white
 * Odd middle  → lightblue
 */
function getSlideTheme(index, total) {
  const n = index + 1;
  if (n === 1 || n === total) return 'navy';
  return n % 2 === 0 ? 'white' : 'lightblue';
}

/**
 * Format content lines into HTML for a slide.
 */
function formatContent(lines, isHook, isCTA) {
  const items = lines.map(l => l.trim()).filter(Boolean);
  if (!items.length) return '';

  if (isHook) {
    return items.map(l => `<p class="hook-text">${escHtml(l)}</p>`).join('');
  }
  if (isCTA) {
    return items.map(l => `<p class="cta-text">${escHtml(l)}</p>`).join('');
  }

  // Use <ul> if majority of lines look like bullets (→, •, ▸, ·, -)
  const bulletCount = items.filter(l => /^[→•▸·]\s/.test(l)).length;
  if (bulletCount > items.length / 2) {
    return '<ul>' + items.map(l => {
      const clean = l.replace(/^[→•▸·]\s+/, '');
      return `<li>${escHtml(clean)}</li>`;
    }).join('') + '</ul>';
  }

  return items.map(l => `<p>${escHtml(l)}</p>`).join('');
}

/**
 * Parse carousel slides from a single post's markdown text.
 * Returns { slides: [{num, title, content}], caption } or null.
 */
function parseCarouselSlides(postText) {
  // Find ### Option 1: Carousel section
  const carouselMatch = postText.match(
    /###\s+Option\s+1:\s+Carousel([\s\S]*?)(?=\n###\s+Option\s+2:|$)/i
  );
  if (!carouselMatch) return null;
  const section = carouselMatch[0];

  // Extract content inside code fences (```...```)
  const codeMatch = section.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!codeMatch) return null;
  const raw = codeMatch[1];

  // Split by [Slide N — Title] markers
  const slides = [];
  const slideRe = /\[Slide\s+(\d+)\s*[—–\-]+\s*([^\]]*)\]/g;
  const allMatches = [];
  let m;
  while ((m = slideRe.exec(raw)) !== null) {
    allMatches.push({ num: parseInt(m[1], 10), title: m[2].trim(), index: m.index, full: m[0] });
  }

  for (let i = 0; i < allMatches.length; i++) {
    const match = allMatches[i];
    const contentStart = match.index + match.full.length;
    const contentEnd = i + 1 < allMatches.length ? allMatches[i + 1].index : raw.length;
    const content = raw.slice(contentStart, contentEnd).trim();
    slides.push({ num: match.num, title: match.title, content });
  }

  if (!slides.length) return null;

  // Extract **Caption**: section
  const captionMatch = section.match(/\*\*Caption\*\*:\s*\n([\s\S]*?)(?=\n###|\n\*\*|$)/);
  const caption = captionMatch ? captionMatch[1].trim() : '';

  return { slides, caption };
}

/**
 * Parse single image option from a post.
 * Returns { imageText, bodyText } or null.
 */
function parseSingleImageOption(postText) {
  const singleMatch = postText.match(
    /###\s+Option\s+2:\s+Single\s+Image([\s\S]*?)(?=\n###\s+Option|\n---|\n##\s+Post\s+[AB]|$)/i
  );
  if (!singleMatch) return null;
  const section = singleMatch[1];

  const imageTextMatch = section.match(/\*\*Image\s+text\*\*:\s*(.+)/i);
  const bodyMatch = section.match(/\*\*Body\s+text\*\*:\s*\n([\s\S]*?)(?=\n###|\n\*\*|$)/i);

  return {
    imageText: imageTextMatch ? imageTextMatch[1].trim() : '',
    bodyText:  bodyMatch ? bodyMatch[1].trim() : '',
  };
}

/**
 * Generate full 1080×1350 HTML for all slides.
 */
function generateSlideHTML(slides) {
  const total = slides.length;

  const slideBlocks = slides.map((slide, i) => {
    const theme   = getSlideTheme(i, total);
    const isHook  = i === 0;
    const isCTA   = i === total - 1;
    const num     = String(i + 1).padStart(2, '0');
    const tot     = String(total).padStart(2, '0');
    const contentLines  = slide.content.split('\n');
    const contentHTML   = formatContent(contentLines, isHook, isCTA);
    const labelClass    = `slide-label-${theme}`;

    return `<div class="slide slide-${theme}">
  <div class="slide-top">
    <span class="brand">PerfecTwin</span>
    <span class="slide-num">${num}/${tot}</span>
  </div>
  <div class="slide-body">
    ${slide.title ? `<div class="slide-label ${labelClass}">${escHtml(slide.title.toUpperCase())}</div>` : ''}
    <div class="slide-content">${contentHTML}</div>
  </div>
  <div class="slide-bottom">
    <span class="footer-text">SAP Test Automation</span>
  </div>
</div>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  background: #111;
}

/* ── Slide base ── */
.slide {
  width: 1080px;
  height: 1350px;
  display: flex;
  flex-direction: column;
  page-break-after: always;
  overflow: hidden;
  position: relative;
}
.slide:last-child { page-break-after: auto; }

/* ── Color themes ── */
.slide-navy      { background: ${COLORS.navy};      color: ${COLORS.cream}; }
.slide-white     { background: ${COLORS.white};     color: ${COLORS.dark};  border-top: 10px solid ${COLORS.terracotta}; }
.slide-lightblue { background: ${COLORS.lightBlue}; color: ${COLORS.dark};  border-top: 10px solid ${COLORS.sage}; }

/* Bottom accent line for light slides */
.slide-white::after, .slide-lightblue::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 8px;
  background: ${COLORS.navy};
  opacity: 0.18;
}

/* ── Top bar ── */
.slide-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 52px 68px 0;
  flex-shrink: 0;
}
.brand {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
.slide-navy .brand      { color: ${COLORS.terracotta}; }
.slide-white .brand     { color: ${COLORS.navy}; }
.slide-lightblue .brand { color: ${COLORS.navy}; }

.slide-num {
  font-size: 20px;
  font-weight: 600;
  opacity: 0.38;
}

/* ── Body ── */
.slide-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 52px 84px;
  overflow: hidden;
}

/* ── Section label ── */
.slide-label {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 3.5px;
  margin-bottom: 44px;
  opacity: 0.7;
}
.slide-label-navy      { color: ${COLORS.terracotta}; }
.slide-label-white     { color: ${COLORS.terracotta}; }
.slide-label-lightblue { color: ${COLORS.sage}; }

/* ── Hook text (Slide 1) ── */
.hook-text {
  font-size: 74px;
  font-weight: 800;
  line-height: 1.18;
  margin-bottom: 18px;
  color: ${COLORS.cream};
  word-break: keep-all;
}

/* ── CTA text (last slide) ── */
.cta-text {
  font-size: 52px;
  font-weight: 700;
  line-height: 1.35;
  margin-bottom: 24px;
  color: ${COLORS.cream};
  word-break: keep-all;
}

/* ── Content paragraphs ── */
.slide-content p {
  font-size: 33px;
  line-height: 1.68;
  margin-bottom: 22px;
  font-weight: 500;
}
.slide-navy .slide-content p { color: ${COLORS.cream}; }

/* ── Bullet list ── */
.slide-content ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.slide-content ul li {
  font-size: 30px;
  line-height: 1.62;
  margin-bottom: 26px;
  padding-left: 38px;
  position: relative;
  font-weight: 500;
}
.slide-content ul li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 14px;
  width: 14px;
  height: 14px;
  border-radius: 3px;
}
.slide-navy .slide-content ul li      { color: ${COLORS.cream}; }
.slide-white .slide-content ul li::before     { background: ${COLORS.terracotta}; }
.slide-lightblue .slide-content ul li::before { background: ${COLORS.sage}; }
.slide-navy .slide-content ul li::before      { background: ${COLORS.cream}; opacity: 0.7; }

/* ── Bottom bar ── */
.slide-bottom {
  padding: 0 68px 48px;
  flex-shrink: 0;
}
.footer-text {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  opacity: 0.35;
}
</style>
</head>
<body>
${slideBlocks.join('\n')}
</body>
</html>`;
}

module.exports = { parseCarouselSlides, parseSingleImageOption, generateSlideHTML };