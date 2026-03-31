/**
 * Markdown → PDF 변환기
 * marked로 HTML 변환 후 playwright로 PDF 생성
 */

const { marked } = require("marked");
const { chromium } = require("playwright");

/**
 * Markdown 문자열을 PDF Buffer로 변환한다.
 * @param {string} markdown - Markdown 리포트 내용
 * @returns {Promise<Buffer>} PDF 바이너리
 */
async function generatePDF(markdown) {
  const html = marked.parse(markdown);

  const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&family=Inter:wght@400;600;700&display=swap');
  body {
    font-family: 'Inter', 'Noto Sans KR', sans-serif;
    font-size: 11px;
    line-height: 1.6;
    color: #1a1a1a;
    margin: 0;
    padding: 40px 50px;
  }
  h1 { font-size: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 20px; }
  h2 { font-size: 15px; color: #2563eb; margin-top: 28px; margin-bottom: 10px; }
  h3 { font-size: 13px; color: #374151; margin-top: 18px; margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0 16px; font-size: 10px; }
  th { background: #f1f5f9; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #e2e8f0; }
  td { padding: 5px 8px; border: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  ul, ol { padding-left: 20px; }
  li { margin-bottom: 4px; }
  strong { color: #1e40af; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 10px; }
  blockquote { border-left: 3px solid #2563eb; padding-left: 12px; color: #4b5563; margin: 10px 0; }
  p { margin: 6px 0; }
</style>
</head>
<body>${html}</body>
</html>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      printBackground: true,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

module.exports = { generatePDF };
