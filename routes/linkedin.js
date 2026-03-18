'use strict';

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { getOutputDir } = require('../scripts/lib/file-manager');
const { parseCarouselSlides, parseSingleImageOption, generateSlideHTML } = require('../lib/carousel-renderer');

const OUTPUT_DIR = getOutputDir();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readLinkedinCompanyMd(weekId) {
  const weekPath = path.join(OUTPUT_DIR, weekId);
  for (const p of ['content/linkedin-company.md', 'linkedin-company.md']) {
    const fp = path.join(weekPath, p);
    if (fs.existsSync(fp)) return { filePath: fp, markdown: fs.readFileSync(fp, 'utf-8') };
  }
  return null;
}

// postNum: 1 = Post A, 2 = Post B
function getPostText(markdown, postNum) {
  const headerRe = /^##\s+Post\s+([AB])[:\s]*(.*)/gm;
  const headers  = [];
  let m;
  while ((m = headerRe.exec(markdown)) !== null) {
    headers.push({ index: m.index });
  }
  if (headers.length < postNum) return null;
  const start = headers[postNum - 1].index;
  const end   = postNum < headers.length ? headers[postNum].index : markdown.length;
  return markdown.slice(start, end);
}

// ─── GET /api/linkedin/carousel/:weekId/:postNum ──────────────────────────────
// Returns: { slides, caption, singleImage, totalSlides }
router.get('/carousel/:weekId/:postNum', (req, res) => {
  const { weekId, postNum } = req.params;
  const num  = parseInt(postNum, 10);
  const file = readLinkedinCompanyMd(weekId);
  if (!file) return res.status(404).json({ error: 'linkedin-company.md not found' });

  const postText = getPostText(file.markdown, num);
  if (!postText) return res.status(404).json({ error: `Post ${num} not found` });

  const carousel = parseCarouselSlides(postText);
  if (!carousel) return res.status(404).json({ error: 'Carousel (Option 1) not found in post' });

  const singleImage = parseSingleImageOption(postText) || { imageText: '', bodyText: '' };

  res.json({
    slides:      carousel.slides,
    caption:     carousel.caption,
    singleImage,
    totalSlides: carousel.slides.length,
  });
});

// ─── GET /api/linkedin/carousel-html/:weekId/:postNum ────────────────────────
// Returns rendered HTML (for preview in new tab)
router.get('/carousel-html/:weekId/:postNum', (req, res) => {
  const { weekId, postNum } = req.params;
  const num  = parseInt(postNum, 10);
  const file = readLinkedinCompanyMd(weekId);
  if (!file) return res.status(404).send('linkedin-company.md not found');

  const postText = getPostText(file.markdown, num);
  if (!postText) return res.status(404).send(`Post ${num} not found`);

  const carousel = parseCarouselSlides(postText);
  if (!carousel) return res.status(404).send('Carousel not found');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(generateSlideHTML(carousel.slides));
});

// ─── POST /api/linkedin/generate-pdf ─────────────────────────────────────────
// Body: { weekId, postNum }
// Returns: { success, filename, downloadUrl }
router.post('/generate-pdf', async (req, res) => {
  const { weekId, postNum } = req.body;
  if (!weekId || postNum == null) {
    return res.status(400).json({ error: 'weekId and postNum required' });
  }

  const num  = parseInt(postNum, 10);
  const file = readLinkedinCompanyMd(weekId);
  if (!file) return res.status(404).json({ error: 'linkedin-company.md not found' });

  const postText = getPostText(file.markdown, num);
  if (!postText) return res.status(404).json({ error: `Post ${num} not found` });

  const carousel = parseCarouselSlides(postText);
  if (!carousel) return res.status(404).json({ error: 'Carousel not found' });

  // Check Playwright
  let chromium;
  try {
    chromium = require('playwright').chromium;
  } catch {
    return res.status(500).json({
      error: 'Playwright가 설치되지 않았습니다. 터미널에서 npm install playwright && npx playwright install chromium 을 실행하세요.',
    });
  }

  const filesDir = path.join(OUTPUT_DIR, weekId, 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  const datePart = weekId.replace('week-', '');
  const filename = `${datePart}_linkedin-company-${num}.pdf`;
  const pdfPath  = path.join(filesDir, filename);
  const tmpHtml  = path.join(filesDir, `_slide-${num}-tmp.html`);

  let browser;
  try {
    const html = generateSlideHTML(carousel.slides);
    fs.writeFileSync(tmpHtml, html, 'utf-8');

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1080, height: 1350 });

    // Use file:// URL (Windows path → forward slashes)
    const fileUrl = 'file:///' + tmpHtml.replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });

    await page.pdf({
      path:            pdfPath,
      width:           '1080px',
      height:          '1350px',
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    });

    res.json({
      success:     true,
      filename,
      downloadUrl: `/api/linkedin/pdf/${weekId}/${encodeURIComponent(filename)}`,
      slides:      carousel.slides.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  }
});

// ─── GET /api/linkedin/pdf/:weekId/:filename ──────────────────────────────────
router.get('/pdf/:weekId/:filename', (req, res) => {
  const { weekId, filename } = req.params;
  if (filename.includes('..')) return res.status(400).json({ error: 'Invalid filename' });

  const filePath = path.join(OUTPUT_DIR, weekId, 'files', filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'PDF not found' });

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(path.resolve(filePath));
});

module.exports = router;