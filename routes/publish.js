const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const https = require("https");
const multer = require("multer");
const { marked } = require("marked");
const { listWeekFolders, getOutputDir } = require("../scripts/lib/file-manager");

const OUTPUT_DIR = getOutputDir();

function getPublishDataPath(weekId) {
  return path.join(OUTPUT_DIR, weekId, "publish-data.json");
}

function readPublishData(weekId) {
  const p = getPublishDataPath(weekId);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : null;
}

function writePublishData(weekId, data) {
  fs.writeFileSync(getPublishDataPath(weekId), JSON.stringify(data, null, 2), "utf-8");
}

const FILE_MAP = [
  { id: "blog-ko",           label: "한글 블로그",              category: "content",      paths: ["content/blog-ko.md",            "blog-ko.md"] },
  { id: "blog-en",           label: "영어 블로그",              category: "content",      paths: ["content/blog-en.md",            "blog-en.md"] },
  { id: "linkedin-company",  label: "LinkedIn 회사 포스트",     category: "content",      paths: ["content/linkedin-company.md",   "linkedin-company.md"] },
  { id: "linkedin-personal", label: "LinkedIn 개인 포스트",     category: "content",      paths: ["content/linkedin-personal.md",  "linkedin-personal.md"] },
  { id: "x-posts",           label: "X 포스트",                 category: "content",      paths: ["content/x-posts.md",            "x-posts.md"] },
  { id: "img-blog-thumbnail",label: "블로그 썸네일 프롬프트",   category: "image-prompt", paths: ["image-prompts/blog-thumbnail.md"] },
  { id: "img-linkedin",      label: "LinkedIn 이미지 프롬프트", category: "image-prompt", paths: ["image-prompts/linkedin-images.md"] },
  { id: "seo-meta",          label: "SEO 메타",                 category: "meta",         paths: ["meta/seo-meta.json",            "seo-meta.json"] },
  { id: "utm-links",         label: "UTM 링크",                 category: "meta",         paths: ["meta/utm-links.json",           "utm-links.json"] },
];

function detectWeekContents(weekId) {
  const weekPath = path.join(OUTPUT_DIR, weekId);
  const contents = [];
  for (const item of FILE_MAP) {
    for (const relPath of item.paths) {
      if (fs.existsSync(path.join(weekPath, relPath))) {
        contents.push({ id: item.id, label: item.label, category: item.category, file: relPath, status: "draft", publishedAt: null, notes: "" });
        break;
      }
    }
  }
  return contents;
}

function readTopicFromSummary(weekId) {
  const summaryPath = path.join(OUTPUT_DIR, weekId, "summary.md");
  if (!fs.existsSync(summaryPath)) return "";
  const content = fs.readFileSync(summaryPath, "utf-8");
  const match = content.match(/^#\s+(.+)$/m) || content.match(/[Tt]opic[:\s]+(.+)/);
  return match ? match[1].trim() : content.split("\n").find(l => l.trim()) || "";
}

// GET /api/publish/weeks
router.get("/weeks", (req, res) => {
  const weeks = listWeekFolders();
  const result = weeks.map(weekId => {
    const data = readPublishData(weekId);
    if (!data) return { weekId, topic: "", status: "no-data", progress: 0, publishedCount: 0, totalCount: 0, createdAt: null };
    const total = data.contents.length;
    const published = data.contents.filter(c => c.status === "published").length;
    const hasActivity = data.contents.some(c => c.status !== "draft");
    return {
      weekId,
      topic: data.topic || "",
      status: total > 0 && published === total ? "published" : hasActivity ? "partial" : "draft",
      progress: total > 0 ? Math.round((published / total) * 100) : 0,
      publishedCount: published,
      totalCount: total,
      createdAt: data.createdAt,
    };
  });
  res.json(result);
});

// GET /api/publish/week/:weekId
router.get("/week/:weekId", (req, res) => {
  const data = readPublishData(req.params.weekId);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

// POST /api/publish/week
router.post("/week", (req, res) => {
  const { weekId, topic } = req.body;
  if (!weekId) return res.status(400).json({ error: "weekId required" });
  const weekPath = path.join(OUTPUT_DIR, weekId);
  if (!fs.existsSync(weekPath)) return res.status(400).json({ error: `Folder not found: ${weekId}` });

  const contents = detectWeekContents(weekId);
  const resolvedTopic = topic || readTopicFromSummary(weekId);
  const data = { weekId, topic: resolvedTopic, createdAt: new Date().toISOString(), contents, images: [], files: [] };

  fs.mkdirSync(path.join(weekPath, "images"), { recursive: true });
  fs.mkdirSync(path.join(weekPath, "files"), { recursive: true });
  writePublishData(weekId, data);
  res.json(data);
});

// PUT /api/publish/week/:weekId
router.put("/week/:weekId", (req, res) => {
  writePublishData(req.params.weekId, req.body);
  res.json(req.body);
});

// PUT /api/publish/week/:weekId/content/:contentId
router.put("/week/:weekId/content/:contentId", (req, res) => {
  const { weekId, contentId } = req.params;
  const data = readPublishData(weekId);
  if (!data) return res.status(404).json({ error: "Not found" });
  const idx = data.contents.findIndex(c => c.id === contentId);
  if (idx === -1) return res.status(404).json({ error: "Content not found" });
  data.contents[idx] = { ...data.contents[idx], ...req.body };
  writePublishData(weekId, data);
  res.json(data.contents[idx]);
});

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(OUTPUT_DIR, req.params.weekId, file.mimetype.startsWith("image/") ? "images" : "files");
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// POST /api/publish/week/:weekId/upload
router.post("/week/:weekId/upload", upload.single("file"), (req, res) => {
  const { weekId } = req.params;
  const data = readPublishData(weekId);
  if (!data) return res.status(404).json({ error: "Not found" });
  const isImage = req.file.mimetype.startsWith("image/");
  const entry = { filename: req.file.originalname, path: `${isImage ? "images" : "files"}/${req.file.originalname}`, mimetype: req.file.mimetype, uploadedAt: new Date().toISOString() };
  (isImage ? data.images : data.files).push(entry);
  writePublishData(weekId, data);
  res.json(entry);
});

// GET /api/publish/week/:weekId/file/:filename
router.get("/week/:weekId/file/:filename", (req, res) => {
  const { weekId, filename } = req.params;
  if (filename.includes("..")) return res.status(400).json({ error: "Invalid filename" });
  const weekPath = path.join(OUTPUT_DIR, weekId);
  for (const sub of ["images", "files"]) {
    const fp = path.join(weekPath, sub, filename);
    if (fs.existsSync(fp)) return res.sendFile(fp);
  }
  res.status(404).json({ error: "File not found" });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Parse blog-en.md: extract meta section + body markdown
function parseBlogEn(markdown) {
  const titleMatch = markdown.match(/\*\*Title\*\*:\s*(.+)/);
  const descMatch = markdown.match(/\*\*Meta Description\*\*:\s*(.+)/);
  const slugMatch = markdown.match(/\*\*URL Slug\*\*:\s*(.+)/);
  const title = titleMatch ? titleMatch[1].trim() : "";
  const description = descMatch ? descMatch[1].trim() : "";
  const slug = slugMatch ? slugMatch[1].trim() : (title ? slugify(title) : "");
  const bodyMatch = markdown.match(/^##\s+Body\s*\n([\s\S]*)/m);
  const bodyMarkdown = bodyMatch ? bodyMatch[1].trim() : markdown;
  return { title, description, slug, bodyMarkdown };
}

// Shift headings one level down (h1→h2, h2→h3, h3→h4) before converting to HTML
function shiftHeadings(markdown) {
  return markdown.replace(/^(#{1,4})\s/gm, (_, hashes) => "#".repeat(Math.min(hashes.length + 1, 6)) + " ");
}

function markdownToHtml(markdown) {
  return marked.parse(shiftHeadings(markdown));
}

// Call inblog REST API
function inblogRequest(method, urlPath, body, apiKey) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: "inblog.ai",
      path: urlPath,
      method,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── GET /api/publish/week/:weekId/content/blog-ko ──────────────────────────
router.get("/week/:weekId/content/blog-ko", (req, res) => {
  const { weekId } = req.params;
  const weekPath = path.join(OUTPUT_DIR, weekId);

  let mdPath = null;
  for (const p of ["content/blog-ko.md", "blog-ko.md"]) {
    const fp = path.join(weekPath, p);
    if (fs.existsSync(fp)) { mdPath = fp; break; }
  }
  if (!mdPath) return res.status(404).json({ error: "blog-ko.md not found" });

  const markdown = fs.readFileSync(mdPath, "utf-8");

  // Parse meta section: **제목**, **URL 슬러그**, **메타 디스크립션**
  const metaTitleMatch = markdown.match(/\*\*제목\*\*:\s*(.+)/);
  const metaSlugMatch  = markdown.match(/\*\*URL 슬러그\*\*:\s*(.+)/);
  const metaDescMatch  = markdown.match(/\*\*메타 디스크립션\*\*:\s*(.+)/);
  // Fallback: first # heading
  const headingMatch   = markdown.match(/^#\s+(.+)$/m);

  const title = (metaTitleMatch ? metaTitleMatch[1] : headingMatch ? headingMatch[1] : "").trim();
  const slug  = metaSlugMatch ? metaSlugMatch[1].trim() : slugify(title);
  const description = metaDescMatch ? metaDescMatch[1].trim() : "";

  // Extract body after ## 본문
  const bodyMatch = markdown.match(/^##\s+본문\s*\n([\s\S]*)/m);
  const bodyMarkdown = bodyMatch ? bodyMatch[1].trim() : markdown;

  const thumbPath = path.join(weekPath, "images", "blog-thumbnail.png");
  const thumbJpg  = path.join(weekPath, "images", "blog-thumbnail.jpg");
  const thumbWebp = path.join(weekPath, "images", "blog-thumbnail.webp");
  let thumbnailFilename = null;
  if (fs.existsSync(thumbPath))      thumbnailFilename = "blog-thumbnail.png";
  else if (fs.existsSync(thumbJpg))  thumbnailFilename = "blog-thumbnail.jpg";
  else if (fs.existsSync(thumbWebp)) thumbnailFilename = "blog-thumbnail.webp";

  res.json({
    title,
    slug: slug || "untitled",
    description,
    markdown: bodyMarkdown,
    hasThumbnail: !!thumbnailFilename,
    thumbnailUrl: thumbnailFilename ? `/api/publish/week/${weekId}/file/${thumbnailFilename}` : null,
    blogUrl: process.env.INBLOG_KO_BLOG_URL || "https://ko.blog.perfectwin.ai",
  });
});

// ─── GET /api/publish/week/:weekId/content/blog-en ──────────────────────────
router.get("/week/:weekId/content/blog-en", (req, res) => {
  const { weekId } = req.params;
  const weekPath = path.join(OUTPUT_DIR, weekId);

  // Find blog-en.md (new or legacy path)
  let mdPath = null;
  for (const p of ["content/blog-en.md", "blog-en.md"]) {
    const fp = path.join(weekPath, p);
    if (fs.existsSync(fp)) { mdPath = fp; break; }
  }
  if (!mdPath) return res.status(404).json({ error: "blog-en.md not found" });

  const markdown = fs.readFileSync(mdPath, "utf-8");
  const { title, description, slug, bodyMarkdown } = parseBlogEn(markdown);

  // Try to get description from seo-meta.json if not in md
  let resolvedDescription = description;
  if (!resolvedDescription) {
    for (const p of ["meta/seo-meta.json", "seo-meta.json"]) {
      const fp = path.join(weekPath, p);
      if (fs.existsSync(fp)) {
        try {
          const meta = JSON.parse(fs.readFileSync(fp, "utf-8"));
          resolvedDescription = meta?.en?.metaDescription || meta?.ko?.metaDescription || "";
        } catch { /* ignore */ }
        break;
      }
    }
  }

  // Check thumbnail
  const thumbPath = path.join(weekPath, "images", "blog-thumbnail.png");
  const thumbJpg = path.join(weekPath, "images", "blog-thumbnail.jpg");
  const thumbWebp = path.join(weekPath, "images", "blog-thumbnail.webp");
  let thumbnailFilename = null;
  if (fs.existsSync(thumbPath)) thumbnailFilename = "blog-thumbnail.png";
  else if (fs.existsSync(thumbJpg)) thumbnailFilename = "blog-thumbnail.jpg";
  else if (fs.existsSync(thumbWebp)) thumbnailFilename = "blog-thumbnail.webp";

  res.json({
    title,
    slug: slug || slugify(title),
    description: resolvedDescription,
    markdown: bodyMarkdown,
    hasThumbnail: !!thumbnailFilename,
    thumbnailUrl: thumbnailFilename ? `/api/publish/week/${weekId}/file/${thumbnailFilename}` : null,
    blogUrl: process.env.INBLOG_BLOG_URL || "https://blog.perfectwin.ai",
  });
});

// ─── Shared inblog publish helper ────────────────────────────────────────────
async function inblogPublish({ apiKey, subdomain, blogUrl, weekId, contentId, title, slug, description, contentMarkdown, thumbnailPath, publishNow }) {
  let thumbAbsPath = null;
  if (thumbnailPath) {
    thumbAbsPath = thumbnailPath.startsWith("/")
      ? thumbnailPath
      : path.join(OUTPUT_DIR, weekId, thumbnailPath);
    if (!fs.existsSync(thumbAbsPath)) thumbAbsPath = null;
  }

  const contentHtml = markdownToHtml(contentMarkdown);

  let imageData = null;
  if (thumbAbsPath) {
    const buf = fs.readFileSync(thumbAbsPath);
    const ext = path.extname(thumbAbsPath).slice(1).toLowerCase();
    const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    imageData = `data:${mime};base64,${buf.toString("base64")}`;
  }

  function buildCreateBody(withImage) {
    return {
      jsonapi: { version: "1.0" },
      data: {
        type: "posts",
        attributes: {
          title, slug, description,
          content_html: contentHtml,
          published: false,
          ...(withImage && imageData ? { image: imageData } : {}),
        },
      },
    };
  }

  let createRes = await inblogRequest("POST", "/api/v1/posts", buildCreateBody(true), apiKey);
  if (createRes.status >= 500 && imageData) {
    console.log("[inblog] 5xx with image, retrying without image...");
    createRes = await inblogRequest("POST", "/api/v1/posts", buildCreateBody(false), apiKey);
  }
  if (createRes.status >= 400) {
    const detail = typeof createRes.body === "object" ? JSON.stringify(createRes.body) : String(createRes.body);
    throw new Error(`inblog 오류 (${createRes.status}): ${detail}`);
  }

  const postId = createRes.body?.data?.id;
  console.log("[inblog] create response:", JSON.stringify(createRes.body?.data?.attributes || createRes.body, null, 2));
  if (!postId) throw new Error("inblog post creation failed: No post ID in response");

  let publishedSlug = slug;
  let finalStatus = "draft";

  if (publishNow !== false) {
    const publishRes = await inblogRequest("PATCH", `/api/v1/posts/${postId}/publish`, {
      jsonapi: { version: "1.0" },
      data: { type: "publish_action", attributes: { action: "publish" } },
    }, apiKey);
    console.log("[inblog] publish response:", JSON.stringify(publishRes.body?.data?.attributes || publishRes.body, null, 2));
    if (publishRes.status >= 400) throw new Error(`inblog publish failed (${publishRes.status})`);
    const attrs = publishRes.body?.data?.attributes || {};
    publishedSlug = attrs.slug || slug;
    // Use the actual blog URL from the response if available
    const actualBlogUrl = attrs.blog_url || attrs.blogUrl || attrs.blog?.url || null;
    blogUrl = actualBlogUrl || blogUrl || `https://inblog.ai/${subdomain}`;
    finalStatus = "published";
  }

  const resolvedBlogUrl = blogUrl || `https://inblog.ai/${subdomain}`;
  const publishedUrl = `${resolvedBlogUrl}/${publishedSlug}`;

  const data = readPublishData(weekId);
  if (data) {
    const idx = data.contents.findIndex(c => c.id === contentId);
    if (idx !== -1) {
      data.contents[idx].status = finalStatus;
      data.contents[idx].publishedAt = new Date().toISOString();
      data.contents[idx].publishedUrl = publishedUrl;
      data.contents[idx].inblogPostId = postId;
    }
    writePublishData(weekId, data);
  }

  return { postId, publishedUrl, finalStatus, thumbAbsPath };
}

// ─── POST /api/publish/inblog ────────────────────────────────────────────────
router.post("/inblog", async (req, res) => {
  const {
    weekId, title, slug, description, contentMarkdown, thumbnailPath, publishNow,
    publishToFramer, framerTitle, framerSubtitle, framerFeatured,
  } = req.body;
  const apiKey = process.env.INBLOG_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: "INBLOG_API_KEY not configured" });
  if (!weekId || !title || !contentMarkdown) return res.status(400).json({ success: false, error: "weekId, title, contentMarkdown required" });

  try {
    const { postId, publishedUrl, finalStatus, thumbAbsPath } = await inblogPublish({
      apiKey, subdomain: process.env.INBLOG_BLOG_SUBDOMAIN, blogUrl: process.env.INBLOG_BLOG_URL,
      weekId, contentId: "blog-en", title, slug, description, contentMarkdown, thumbnailPath, publishNow,
    });

    let framerResult = null;
    if (publishToFramer && process.env.FRAMER_CMS_API_TOKEN) {
      framerResult = await publishToFramerCms({
        thumbAbsPath, publishedUrl, publishedSlug: slug,
        title: framerTitle || title,
        subtitle: framerSubtitle || description,
        featured: framerFeatured || false,
      });
    } else if (publishToFramer && !process.env.FRAMER_CMS_API_TOKEN) {
      framerResult = { success: false, error: "FRAMER_CMS_API_TOKEN not configured" };
    }

    res.json({ success: true, postId, publishedUrl, status: finalStatus, framer: framerResult });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/publish/inblog-ko ─────────────────────────────────────────────
router.post("/inblog-ko", async (req, res) => {
  const { weekId, title, slug, description, contentMarkdown, thumbnailPath, publishNow } = req.body;
  const apiKey = process.env.INBLOG_KO_API_KEY || process.env.INBLOG_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: "INBLOG_KO_API_KEY not configured" });
  if (!weekId || !title || !contentMarkdown) return res.status(400).json({ success: false, error: "weekId, title, contentMarkdown required" });

  try {
    const { postId, publishedUrl, finalStatus } = await inblogPublish({
      apiKey, subdomain: process.env.INBLOG_KO_BLOG_SUBDOMAIN, blogUrl: process.env.INBLOG_KO_BLOG_URL,
      weekId, contentId: "blog-ko", title, slug, description, contentMarkdown, thumbnailPath, publishNow,
    });
    res.json({ success: true, postId, publishedUrl, status: finalStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Framer CMS helper ───────────────────────────────────────────────────────
async function publishToFramerCms({ thumbAbsPath, publishedUrl, publishedSlug, title, subtitle, featured }) {
  let framer;
  try {
    const { connect } = await import("framer-api");
    framer = await connect(process.env.FRAMER_PROJECT_URL, process.env.FRAMER_CMS_API_TOKEN);

    // Upload thumbnail
    let thumbnailField = {};
    if (thumbAbsPath) {
      try {
        const ext = path.extname(thumbAbsPath).slice(1).toLowerCase();
        const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        const imageBytes = fs.readFileSync(thumbAbsPath);
        const uploaded = await framer.uploadImage({ image: { bytes: new Uint8Array(imageBytes), mimeType: mime }, name: title });
        thumbnailField = { "jq4BBAGN3": { type: "image", value: uploaded.url, alt: title } };
      } catch { /* skip image if upload fails */ }
    }

    const today = new Date().toISOString().split("T")[0];
    const collection = await framer.getCollection(process.env.FRAMER_COLLECTION_ID);

    await collection.addItems([{
      slug: publishedSlug,
      fieldData: {
        "BVgNsC65A": { type: "string", value: title },
        "rKwlkv2dT": { type: "formattedText", value: `<p>${subtitle}</p>` },
        ...thumbnailField,
        "ms5QMIA5s": { type: "date", value: today },
        "vbj565Osc": { type: "link", value: publishedUrl },
        "K9xwshcJ3": { type: "enum", value: "qr0N73LUU" }, // "Past" case ID
        "Wt0CDKXaK": { type: "boolean", value: featured },
        "UGnT5Ey_I": { type: "number", value: 0 },
      },
    }]);

    const publishResult = await framer.publish();
    await framer.deploy(publishResult.deployment.id);

    return { success: true, message: "홈페이지에 게시 완료" };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (framer) {
      try { await framer.disconnect(); } catch { /* ignore */ }
    }
  }
}

// POST /api/publish/week/:weekId/upload-thumbnail  (always saves as blog-thumbnail.{ext})
const thumbUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(OUTPUT_DIR, req.params.weekId, "images");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".png";
      cb(null, `blog-thumbnail${ext}`);
    },
  }),
});

router.post("/week/:weekId/upload-thumbnail", thumbUpload.single("file"), (req, res) => {
  const { weekId } = req.params;
  const filename = req.file.filename;
  res.json({
    filename,
    url: `/api/publish/week/${weekId}/file/${filename}`,
  });
});

module.exports = router;
