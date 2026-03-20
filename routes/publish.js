const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const https = require("https");
const sharp = require("sharp");
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

// 발행 진행율 추적 대상 6개
const TRACKED_ITEMS = [
  { id: "blog-ko",            label: "한글 블로그",             paths: ["content/blog-ko.md",          "blog-ko.md"] },
  { id: "blog-en",            label: "영어 블로그",             paths: ["content/blog-en.md",          "blog-en.md"] },
  { id: "linkedin-company-1", label: "LinkedIn Company Post 1", paths: ["content/linkedin-company.md", "linkedin-company.md"] },
  { id: "linkedin-company-2", label: "LinkedIn Company Post 2", paths: ["content/linkedin-company.md", "linkedin-company.md"] },
  { id: "x-post-1",           label: "X Post 1",               paths: ["content/x-posts.md",          "x-posts.md"] },
  { id: "x-post-2",           label: "X Post 2",               paths: ["content/x-posts.md",          "x-posts.md"] },
];

function detectWeekContents(weekId) {
  const weekPath = path.join(OUTPUT_DIR, weekId);
  return TRACKED_ITEMS.map(item => ({
    id: item.id,
    label: item.label,
    status: "draft",
    publishedAt: null,
    exists: item.paths.some(p => fs.existsSync(path.join(weekPath, p))),
  }));
}

// 기존 publish-data와 새 감지 결과 병합 (발행 상태 보존)
function syncWeekContents(existing, weekId) {
  const fresh = detectWeekContents(weekId);
  const existingMap = Object.fromEntries(existing.map(c => [c.id, c]));
  return fresh.map(item => {
    const old = existingMap[item.id];
    return old ? { ...item, status: old.status, publishedAt: old.publishedAt } : item;
  });
}

function calcWeekStats(contents) {
  const published = contents.filter(c => c.status === "published").length;
  const total = contents.length;
  const status = published === 0 ? "draft" : published === total ? "published" : "partial";
  return { published, total, status };
}

function readTopicFromSummary(weekId) {
  const summaryPath = path.join(OUTPUT_DIR, weekId, "summary.md");
  if (!fs.existsSync(summaryPath)) return "";
  const content = fs.readFileSync(summaryPath, "utf-8");
  const match = content.match(/^#\s+(.+)$/m) || content.match(/[Tt]opic[:\s]+(.+)/);
  return match ? match[1].trim() : content.split("\n").find(l => l.trim()) || "";
}

// GET /api/publish/weeks — auto-detect and sync all week folders
router.get("/weeks", (req, res) => {
  const weeks = listWeekFolders();
  const result = weeks.map(weekId => {
    let data = readPublishData(weekId);

    if (!data) {
      // Auto-register: create publish-data.json from detected contents
      const contents = detectWeekContents(weekId);
      const topic = readTopicFromSummary(weekId);
      const weekPath = path.join(OUTPUT_DIR, weekId);
      fs.mkdirSync(path.join(weekPath, "images"), { recursive: true });
      fs.mkdirSync(path.join(weekPath, "files"), { recursive: true });
      data = { weekId, topic, contents, images: [], files: [] };
      writePublishData(weekId, data);
    } else {
      // Re-sync: preserve publish status, refresh file existence
      const synced = syncWeekContents(data.contents, weekId);
      data = { ...data, contents: synced };
      writePublishData(weekId, data);
    }

    const { published, total, status } = calcWeekStats(data.contents);
    return {
      weekId,
      topic: data.topic || "",
      status,
      progress: total > 0 ? Math.round((published / total) * 100) : 0,
      publishedCount: published,
      totalCount: total,
    };
  });
  res.json(result);
});

// GET /api/publish/week/:weekId
router.get("/week/:weekId", (req, res) => {
  const { weekId } = req.params;
  let data = readPublishData(weekId);
  if (!data) return res.status(404).json({ error: "Not found" });
  // Re-sync file existence on every read
  const synced = syncWeekContents(data.contents, weekId);
  data = { ...data, contents: synced };
  writePublishData(weekId, data);
  res.json(data);
});

// GET /api/publish/week/:weekId/thumbnail-prompt
router.get("/week/:weekId/thumbnail-prompt", (req, res) => {
  const { weekId } = req.params;
  const weekPath = path.join(OUTPUT_DIR, weekId);
  for (const p of ["image-prompts/blog-thumbnail.md", "content/image-prompts/blog-thumbnail.md", "blog-thumbnail-prompt.md"]) {
    const fp = path.join(weekPath, p);
    if (fs.existsSync(fp)) {
      const full = fs.readFileSync(fp, "utf-8");
      // Extract only the Ideogram Prompt section
      const match = full.match(/###\s*Ideogram Prompt\s*\n([\s\S]*?)(?=\n###\s|\n##\s|$)/i);
      const content = match ? match[1].trim() : full.trim();
      return res.json({ content });
    }
  }
  res.status(404).json({ error: "Thumbnail prompt not found" });
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

// ─── GET /api/publish/inblog/meta — tags + authors ───────────────────────────
router.get("/inblog/meta", async (req, res) => {
  const apiKey = process.env.INBLOG_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "INBLOG_API_KEY not configured" });
  try {
    const [tagsRes, authorsRes] = await Promise.all([
      inblogRequest("GET", "/api/v1/tags", null, apiKey),
      inblogRequest("GET", "/api/v1/authors", null, apiKey),
    ]);
    const tags = (tagsRes.body?.data || []).map(t => ({ id: t.id, name: t.attributes.name }));
    const authors = (authorsRes.body?.data || []).map(a => ({
      id: a.id,
      name: a.attributes.author_name || "",
    }));
    res.json({ tags, authors, defaultAuthorId: process.env.INBLOG_DEFAULT_AUTHOR_ID || "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const isGet = method === "GET";
    const payload = isGet ? "" : JSON.stringify(body);
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (!isGet) headers["Content-Length"] = Buffer.byteLength(payload);
    const options = { hostname: "inblog.ai", path: urlPath, method, headers };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (!isGet) req.write(payload);
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
async function inblogPublish({ apiKey, subdomain, blogUrl, weekId, contentId, title, slug, description, contentMarkdown, thumbnailPath, publishNow, tagIds, authorId }) {
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
    // Compress to JPEG to stay under inblog's 1MB base64 limit (~750KB file target)
    const compressed = await sharp(thumbAbsPath)
      .jpeg({ quality: 82 })
      .toBuffer();
    // If still too large, reduce quality further
    const finalBuf = Buffer.byteLength(compressed.toString("base64")) > 900000
      ? await sharp(thumbAbsPath).jpeg({ quality: 60 }).toBuffer()
      : compressed;
    imageData = `data:image/jpeg;base64,${finalBuf.toString("base64")}`;
    console.log(`[inblog] image compressed: ${fs.statSync(thumbAbsPath).size} → ${finalBuf.length} bytes`);
  }

  const relationships = {};
  if (tagIds && tagIds.length > 0) {
    relationships.tags = { data: tagIds.map(id => ({ type: "tags", id: String(id) })) };
  }
  if (authorId) {
    relationships.authors = { data: [{ type: "authors", id: authorId }] };
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
        ...(Object.keys(relationships).length > 0 ? { relationships } : {}),
      },
    };
  }

  let createRes = await inblogRequest("POST", "/api/v1/posts", buildCreateBody(true), apiKey);
  if ((createRes.status >= 500 || createRes.status === 413) && imageData) {
    console.log(`[inblog] ${createRes.status} with image, retrying without image...`);
    createRes = await inblogRequest("POST", "/api/v1/posts", buildCreateBody(false), apiKey);
  }
  // 500 may mean duplicate slug — find and delete existing draft, then retry
  if (createRes.status === 500) {
    console.log("[inblog] 500 on create — checking for duplicate slug:", slug);
    const listRes = await inblogRequest("GET", `/api/v1/posts?per_page=50`, null, apiKey);
    const existing = (listRes.body?.data || []).find(p => p.attributes?.slug === slug);
    if (existing) {
      console.log("[inblog] deleting duplicate draft:", existing.id);
      await inblogRequest("DELETE", `/api/v1/posts/${existing.id}`, null, apiKey);
      createRes = await inblogRequest("POST", "/api/v1/posts", buildCreateBody(false), apiKey);
    }
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
    tagIds, authorId,
  } = req.body;
  const apiKey = process.env.INBLOG_API_KEY;
  if (!apiKey) return res.status(500).json({ success: false, error: "INBLOG_API_KEY not configured" });
  if (!weekId || !title || !contentMarkdown) return res.status(400).json({ success: false, error: "weekId, title, contentMarkdown required" });

  try {
    const { postId, publishedUrl, finalStatus, thumbAbsPath } = await inblogPublish({
      apiKey, subdomain: process.env.INBLOG_BLOG_SUBDOMAIN, blogUrl: process.env.INBLOG_BLOG_URL,
      weekId, contentId: "blog-en", title, slug, description, contentMarkdown, thumbnailPath, publishNow, tagIds, authorId,
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

    const fieldData = {
      "BVgNsC65A": { type: "string", value: title },
      "rKwlkv2dT": { type: "formattedText", value: `<p>${subtitle}</p>` },
      ...thumbnailField,
      "ms5QMIA5s": { type: "date", value: today },
      "vbj565Osc": { type: "link", value: publishedUrl },
      // K9xwshcJ3 (Status enum) omitted — framer-api 0.1.2 fails to serialize enum inputs
      "Wt0CDKXaK": { type: "boolean", value: featured },
      "UGnT5Ey_I": { type: "number", value: 0 },
    };

    try {
      await collection.addItems([{ slug: publishedSlug, fieldData }]);
    } catch (addErr) {
      if (String(addErr.message).toLowerCase().includes("duplicate slug")) {
        // Already exists — remove and re-add with updated data
        const items = await collection.getItems();
        const existing = items.find(i => i.slug === publishedSlug);
        if (existing) {
          await collection.removeItems([existing.id]);
          await collection.addItems([{ slug: publishedSlug, fieldData }]);
        } else {
          throw addErr;
        }
      } else {
        throw addErr;
      }
    }

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

// ─── LinkedIn post parsing ────────────────────────────────────────────────────

function parseLinkedinPosts(markdown) {
  // Strip ## IMAGE section before parsing
  const withoutImage = markdown.replace(/\n\n## IMAGE\n[\s\S]*$/, "").trim();

  // New format: ### POST_BODY_1/2 + ### COMMENT_TEXT_1/2 (2 posts per file)
  const pb1 = withoutImage.match(/###\s*POST_BODY_1\s*\n([\s\S]*?)(?=\n###\s*COMMENT_TEXT_1|\n###\s*POST_BODY_2|$)/i);
  if (pb1) {
    const ct1 = withoutImage.match(/###\s*COMMENT_TEXT_1\s*\n([\s\S]*?)(?=\n###\s*POST_BODY_2|$)/i);
    const pb2 = withoutImage.match(/###\s*POST_BODY_2\s*\n([\s\S]*?)(?=\n###\s*COMMENT_TEXT_2|$)/i);
    const ct2 = withoutImage.match(/###\s*COMMENT_TEXT_2\s*\n([\s\S]*?)$/i);
    const posts = [{ num: 1, title: "Post 1", text: pb1[1].trim(), commentText: ct1 ? ct1[1].trim() : "" }];
    if (pb2) posts.push({ num: 2, title: "Post 2", text: pb2[1].trim(), commentText: ct2 ? ct2[1].trim() : "" });
    return posts;
  }

  // Legacy single-post format: ### POST_BODY / ### COMMENT_TEXT
  const postBodyMatch = withoutImage.match(/###\s*POST_BODY\s*\n([\s\S]*?)(?=\n###\s*COMMENT_TEXT|$)/i);
  if (postBodyMatch) {
    const commentMatch = withoutImage.match(/###\s*COMMENT_TEXT\s*\n([\s\S]*?)$/i);
    return [{
      num: 1,
      title: "Post",
      text: postBodyMatch[1].trim(),
      commentText: commentMatch ? commentMatch[1].trim() : "",
    }];
  }

  const posts = [];
  // Legacy format: ## Post A / ## Post B headers
  const headerPattern = /^##\s+Post\s+([AB])[:\s]*(.*)/gm;
  const headers = [];
  let m;
  while ((m = headerPattern.exec(withoutImage)) !== null) {
    headers.push({ label: m[1], title: m[2].trim(), index: m.index });
  }

  if (headers.length >= 2) {
    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].index;
      const end = i + 1 < headers.length ? headers[i + 1].index : withoutImage.length;
      const body = withoutImage.slice(start, end).replace(/^##\s+Post\s+[AB][:\s]*.*\n/, "").trim();
      const koreanIdx = body.indexOf("### \uD83C\uDDF0\uD83C\uDDF7");
      const cleaned = koreanIdx !== -1 ? body.slice(0, koreanIdx).trim() : body;
      posts.push({ num: i + 1, title: headers[i].title, text: cleaned });
    }
    return posts;
  }

  // Fallback: split by --- separator
  const sections = withoutImage.split(/^---$/m).filter(s => s.trim());
  let num = 1;
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.startsWith("# ")) continue;
    const titleMatch = trimmed.match(/^##?\s+(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : `Post ${num}`;
    posts.push({ num, title, text: trimmed });
    num++;
  }
  return posts;
}

// GET /api/publish/week/:weekId/content/linkedin-company/:postNum
router.get("/week/:weekId/content/linkedin-company/:postNum", (req, res) => {
  const { weekId, postNum } = req.params;
  const num = parseInt(postNum, 10);
  const weekPath = path.join(OUTPUT_DIR, weekId);

  let mdPath = null;
  for (const p of ["content/linkedin-company.md", "linkedin-company.md"]) {
    const fp = path.join(weekPath, p);
    if (fs.existsSync(fp)) { mdPath = fp; break; }
  }
  if (!mdPath) return res.status(404).json({ error: "linkedin-company.md not found" });

  const markdown = fs.readFileSync(mdPath, "utf-8");
  const posts = parseLinkedinPosts(markdown);
  const post = posts.find(p => p.num === num);
  if (!post) return res.status(404).json({ error: `Post ${num} not found (${posts.length} posts parsed)` });

  // Check for dedicated image, fall back to blog thumbnail
  let imageUrl = null;
  const candidates = [`linkedin-company-${num}`, "blog-thumbnail"];
  for (const imgName of candidates) {
    for (const ext of ["png", "jpg", "webp"]) {
      if (fs.existsSync(path.join(weekPath, "images", `${imgName}.${ext}`))) {
        imageUrl = `/api/publish/week/${weekId}/file/${imgName}.${ext}`;
        break;
      }
    }
    if (imageUrl) break;
  }

  res.json({ text: post.text, title: post.title, commentText: post.commentText || "", hasImage: !!imageUrl, imageUrl });
});

// GET /api/publish/week/:weekId/content/linkedin-personal/:postNum
router.get("/week/:weekId/content/linkedin-personal/:postNum", (req, res) => {
  const { weekId, postNum } = req.params;
  const num = parseInt(postNum, 10);
  const weekPath = path.join(OUTPUT_DIR, weekId);

  let mdPath = null;
  for (const p of ["content/linkedin-personal.md", "linkedin-personal.md"]) {
    const fp = path.join(weekPath, p);
    if (fs.existsSync(fp)) { mdPath = fp; break; }
  }
  if (!mdPath) return res.status(404).json({ error: "linkedin-personal.md not found" });

  const markdown = fs.readFileSync(mdPath, "utf-8");
  const posts = parseLinkedinPosts(markdown);
  const post = posts.find(p => p.num === num);
  if (!post) return res.status(404).json({ error: `Post ${num} not found (${posts.length} posts parsed)` });

  let imageUrl = null;
  const candidates = [`linkedin-personal-${num}`, "blog-thumbnail"];
  for (const imgName of candidates) {
    for (const ext of ["png", "jpg", "webp"]) {
      if (fs.existsSync(path.join(weekPath, "images", `${imgName}.${ext}`))) {
        imageUrl = `/api/publish/week/${weekId}/file/${imgName}.${ext}`;
        break;
      }
    }
    if (imageUrl) break;
  }

  res.json({ text: post.text, title: post.title, commentText: post.commentText || "", hasImage: !!imageUrl, imageUrl });
});

// ─── X post parsing ──────────────────────────────────────────────────────────

function parseXPosts(markdown) {
  // Strip ## IMAGE section
  const withoutImage = markdown.replace(/\n\n## IMAGE\n[\s\S]*$/, "").trim();

  // New format: ### X_POST_1 / ### X_POST_2
  const xPost1 = withoutImage.match(/###\s*X_POST_1\s*\n([\s\S]*?)(?=\n###\s*X_POST_2|$)/i);
  if (xPost1) {
    const xPost2 = withoutImage.match(/###\s*X_POST_2\s*\n([\s\S]*?)$/i);
    const posts = [{ num: 1, type: "standalone", text: xPost1[1].trim() }];
    if (xPost2) posts.push({ num: 2, type: "standalone", text: xPost2[1].trim() });
    return { posts, thread: [] };
  }

  const posts = [];

  // Legacy format: ## Standalone Posts → ### Post N (type: ...)
  const standaloneSection = withoutImage.match(/##\s*Standalone Posts\s*\n([\s\S]*?)(?=\n##\s*Thread|\n##\s*🇰🇷|$)/i);
  const threadSection = withoutImage.match(/##\s*Thread[^\n]*\n([\s\S]*?)(?=\n---\s*\n##\s*🇰🇷|\n##\s*🇰🇷|$)/i);

  if (standaloneSection) {
    const postPattern = /###\s*Post\s+(\d+)[^\n]*\n([\s\S]*?)(?=\n###\s*Post\s+\d+|$)/gi;
    let m;
    while ((m = postPattern.exec(standaloneSection[1])) !== null) {
      const num = parseInt(m[1], 10);
      let body = m[2].trim().replace(/^Suggested day:.*$/gm, "").trim();
      posts.push({ num, type: "standalone", text: body });
    }
  }

  const tweets = [];
  if (threadSection) {
    const tweetPattern = /###\s*Tweet\s+(\d+)\s*\n([\s\S]*?)(?=\n###\s*Tweet\s+\d+|$)/gi;
    let m;
    while ((m = tweetPattern.exec(threadSection[1])) !== null) {
      tweets.push({ num: parseInt(m[1], 10), text: m[2].trim() });
    }
  }

  return { posts, thread: tweets };
}

// GET /api/publish/week/:weekId/content/x-post/:postNum
router.get("/week/:weekId/content/x-post/:postNum", (req, res) => {
  const { weekId, postNum } = req.params;
  const num = parseInt(postNum, 10);
  const weekPath = path.join(OUTPUT_DIR, weekId);

  let mdPath = null;
  for (const p of ["content/x-posts.md", "x-posts.md"]) {
    const fp = path.join(weekPath, p);
    if (fs.existsSync(fp)) { mdPath = fp; break; }
  }
  if (!mdPath) return res.status(404).json({ error: "x-posts.md not found" });

  const markdown = fs.readFileSync(mdPath, "utf-8");
  const { posts } = parseXPosts(markdown);
  const post = posts.find(p => p.num === num);
  if (!post) return res.status(404).json({ error: `Post ${num} not found (${posts.length} standalone posts parsed)` });

  let imageUrl = null;
  const imgName = `x-post-${num}`;
  for (const ext of ["png", "jpg", "webp"]) {
    if (fs.existsSync(path.join(weekPath, "images", `${imgName}.${ext}`))) {
      imageUrl = `/api/publish/week/${weekId}/file/${imgName}.${ext}`;
      break;
    }
  }

  res.json({ text: post.text, hasImage: !!imageUrl, imageUrl });
});

// GET /api/publish/week/:weekId/content/x-thread
router.get("/week/:weekId/content/x-thread", (req, res) => {
  const { weekId } = req.params;
  const weekPath = path.join(OUTPUT_DIR, weekId);

  let mdPath = null;
  for (const p of ["content/x-posts.md", "x-posts.md"]) {
    const fp = path.join(weekPath, p);
    if (fs.existsSync(fp)) { mdPath = fp; break; }
  }
  if (!mdPath) return res.status(404).json({ error: "x-posts.md not found" });

  const markdown = fs.readFileSync(mdPath, "utf-8");
  const { thread } = parseXPosts(markdown);
  if (!thread.length) return res.status(404).json({ error: "Thread not found in x-posts.md" });

  res.json({ tweets: thread });
});

// ─── POST /api/publish/buffer — Publish to Buffer (GraphQL) ────────────────────
router.post("/buffer", async (req, res) => {
  const { week, contentType, postNum, text, channelId, mode, dueAt, imageUrl } = req.body;

  if (!text || !channelId) return res.status(400).json({ success: false, error: "text and channelId required" });

  const { createBufferPost } = require("../lib/buffer-client");

  // Map frontend mode names to Buffer GraphQL mode values
  const modeMap = { now: "shareNow", scheduled: "customSchedule", queue: "queue" };
  const bufferMode = modeMap[mode] || mode || "queue";

  try {
    const result = await createBufferPost({
      channelId,
      text,
      mode: bufferMode,
      dueAt: bufferMode === "customSchedule" ? dueAt : null,
      imageUrl: imageUrl || null,
    });

    const bufferId = result.id;
    const status = mode === "now" ? "sent" : mode === "scheduled" ? "scheduled" : "buffer";

    // Update publish-data.json
    if (week && contentType) {
      const weekId = week.startsWith("week-") ? week : week;
      const data = readPublishData(weekId);
      if (data) {
        const contentId = postNum ? `${contentType}-${postNum}` : contentType;
        const labelMap = {
          "linkedin-company": "LinkedIn Company",
          "linkedin-personal": "LinkedIn Personal",
          "x-post": "X Post",
          "x-thread": "X Thread",
        };
        let idx = data.contents.findIndex(c => c.id === contentId);
        if (idx === -1) {
          data.contents.push({
            id: contentId,
            label: `${labelMap[contentType] || contentType} ${postNum || ""}`.trim(),
            category: "content",
            file: contentType.startsWith("x-") ? "content/x-posts.md" : `content/${contentType}.md`,
            status: "published",
            publishedAt: new Date().toISOString(),
            bufferId,
            bufferStatus: status,
            scheduledAt: dueAt || null,
            notes: "",
          });
        } else {
          data.contents[idx].status = "published";
          data.contents[idx].publishedAt = new Date().toISOString();
          data.contents[idx].bufferId = bufferId;
          data.contents[idx].bufferStatus = status;
          data.contents[idx].scheduledAt = dueAt || null;
        }
        writePublishData(weekId, data);
      }
    }

    res.json({ success: true, bufferId, status, scheduledAt: dueAt || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/publish/buffer/thread — Publish X thread (sequential posts)
router.post("/buffer/thread", async (req, res) => {
  const { week, tweets, channelId, mode, dueAt } = req.body;

  if (!tweets || !tweets.length || !channelId) {
    return res.status(400).json({ success: false, error: "tweets array and channelId required" });
  }

  const { createBufferPost } = require("../lib/buffer-client");
  const modeMap = { now: "shareNow", scheduled: "customSchedule", queue: "queue" };
  const bufferMode = modeMap[mode] || mode || "queue";

  try {
    const results = [];
    for (let i = 0; i < tweets.length; i++) {
      const tweetDueAt = bufferMode === "customSchedule" && dueAt
        ? new Date(new Date(dueAt).getTime() + i * 60000).toISOString() // 1 min apart
        : null;

      const result = await createBufferPost({
        channelId,
        text: tweets[i],
        mode: bufferMode,
        dueAt: tweetDueAt,
      });
      results.push({ num: i + 1, bufferId: result.id });
    }

    // Update publish-data.json
    if (week) {
      const weekId = week.startsWith("week-") ? week : week;
      const data = readPublishData(weekId);
      if (data) {
        let idx = data.contents.findIndex(c => c.id === "x-thread");
        const entry = {
          id: "x-thread",
          label: "X Thread",
          category: "content",
          file: "content/x-posts.md",
          status: "published",
          publishedAt: new Date().toISOString(),
          bufferId: results.map(r => r.bufferId).join(","),
          bufferStatus: mode === "now" ? "sent" : mode === "scheduled" ? "scheduled" : "buffer",
          scheduledAt: dueAt || null,
          notes: `${tweets.length} tweets`,
        };
        if (idx === -1) {
          data.contents.push(entry);
        } else {
          data.contents[idx] = { ...data.contents[idx], ...entry };
        }
        writePublishData(weekId, data);
      }
    }

    res.json({ success: true, results, status: mode === "now" ? "sent" : mode === "scheduled" ? "scheduled" : "buffer" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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
