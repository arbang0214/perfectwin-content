import { showToast } from "../components/toast.js";

// 주차별 발행 아이템 (고정 목록)
const PUBLISH_ITEMS = [
  { id: "blog-en",           icon: "📄", label: "영어 블로그",          channel: "inblog",   route: "blog-en" },
  { id: "blog-ko",           icon: "📄", label: "한글 블로그",           channel: "inblog",   route: null },
  { id: "linkedin-company",  icon: "💼", label: "LinkedIn 회사 포스트", channel: "LinkedIn", route: null },
  { id: "linkedin-personal", icon: "🤝", label: "LinkedIn 개인 포스트", channel: "LinkedIn", route: null },
  { id: "x-posts",           icon: "🐦", label: "X 포스트 (5개)",       channel: "X",        route: null },
  { id: "x-thread",          icon: "🧵", label: "X 스레드",             channel: "X",        route: null },
  { id: "homepage-card",     icon: "🏠", label: "홈페이지 블로그 카드", channel: "Framer",   route: null },
];

// ─── Entry point ──────────────────────────────────────────────────────────────
export function renderDashboard(container, subroute) {
  if (subroute === "new") {
    renderNewWeek(container);
  } else if (subroute && subroute.startsWith("week-")) {
    const slashIdx = subroute.indexOf("/");
    if (slashIdx !== -1) {
      const weekId = subroute.slice(0, slashIdx);
      const contentRoute = subroute.slice(slashIdx + 1);
      if (contentRoute === "blog-en") {
        renderBlogEnPublish(container, weekId);
      } else {
        renderWeekDetail(container, weekId);
      }
    } else {
      renderWeekDetail(container, subroute);
    }
  } else {
    renderWeekList(container);
  }
}

// ─── Screen 1: Week list ──────────────────────────────────────────────────────
async function renderWeekList(container) {
  container.innerHTML = `
    <div class="db-toolbar">
      <div class="page-header">
        <h1 class="page-title">발행 대시보드</h1>
        <p class="page-subtitle">생성된 콘텐츠의 발행 상태를 관리합니다</p>
      </div>
      <button class="btn-sm btn-primary" id="btnNewWeek">+ 새 주 등록</button>
    </div>
    <div id="weekListBody"><div style="text-align:center;padding:40px;color:var(--text-muted)">불러오는 중...</div></div>
  `;
  container.querySelector("#btnNewWeek").onclick = () => { location.hash = "#dashboard/new"; };

  let weeks;
  try {
    const res = await fetch("/api/publish/weeks");
    weeks = await res.json();
  } catch {
    container.querySelector("#weekListBody").innerHTML = `<p style="color:var(--error);padding:16px">데이터를 불러오지 못했습니다.</p>`;
    return;
  }

  const body = container.querySelector("#weekListBody");

  if (!weeks.length) {
    body.innerHTML = `
      <div class="empty-page" style="min-height:50vh">
        <div class="empty-icon">📅</div>
        <h2>등록된 주가 없습니다</h2>
        <p>콘텐츠를 생성한 후 "새 주 등록"으로 발행 관리를 시작하세요</p>
      </div>`;
    return;
  }

  const rows = weeks.map(w => {
    const statusLabel = { published: "발행 완료", partial: "진행 중", draft: "초안", "no-data": "미등록" }[w.status] || w.status;
    const date = w.createdAt ? new Date(w.createdAt).toLocaleDateString("ko-KR") : "—";
    const isFull = w.progress === 100;
    return `
      <tr class="row-link" data-week="${w.weekId}">
        <td class="week-id-cell">${w.weekId}</td>
        <td><span class="week-topic">${w.topic || "—"}</span></td>
        <td><span class="status-badge ${w.status}">${statusLabel}</span></td>
        <td>
          <div class="progress-cell">
            <div class="progress-bar-wrap"><div class="progress-bar-fill ${isFull ? "full" : ""}" style="width:${w.progress}%"></div></div>
            <span class="progress-label">${w.publishedCount}/${w.totalCount}</span>
          </div>
        </td>
        <td class="week-date-cell">${date}</td>
      </tr>`;
  }).join("");

  body.innerHTML = `
    <div class="week-table-wrap">
      <table class="week-table">
        <thead><tr>
          <th>주차</th><th>주제</th><th>상태</th><th>발행 진행</th><th>등록일</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  body.querySelectorAll(".row-link").forEach(tr => {
    tr.onclick = () => { location.hash = `#dashboard/${tr.dataset.week}`; };
    tr.style.cursor = "pointer";
  });
}

// ─── Screen 2: New week registration ─────────────────────────────────────────
async function renderNewWeek(container) {
  let folders = [];
  try {
    const res = await fetch("/api/outputs");
    const data = await res.json();
    folders = data.map(d => d.folder);
  } catch { /* ignore */ }

  container.innerHTML = `
    <button class="db-back" id="btnBack">← 목록으로</button>
    <div class="page-header" style="margin-bottom:24px">
      <h1 class="page-title">새 주 등록</h1>
      <p class="page-subtitle">발행 관리를 시작할 콘텐츠 주를 등록합니다</p>
    </div>
    <div class="db-form">
      <div class="form-group">
        <label>Output 폴더 선택</label>
        <select id="folderSelect">
          <option value="">— 폴더를 선택하세요 —</option>
          ${folders.map(f => `<option value="${f}">${f}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>주제 (자동 감지됨, 수정 가능)</label>
        <input type="text" id="topicInput" placeholder="자동 감지 중..." />
      </div>
      <div id="autoDetectNote" style="font-size:12px;color:var(--text-muted);margin-top:-10px;margin-bottom:14px"></div>
      <div class="btn-row" style="justify-content:flex-start">
        <button class="btn btn-primary" id="btnCreate" disabled>등록하기</button>
        <button class="btn btn-secondary" id="btnCancel">취소</button>
      </div>
    </div>
  `;

  container.querySelector("#btnBack").onclick = () => { location.hash = "#dashboard"; };
  container.querySelector("#btnCancel").onclick = () => { location.hash = "#dashboard"; };

  const folderSelect = container.querySelector("#folderSelect");
  const topicInput = container.querySelector("#topicInput");
  const btnCreate = container.querySelector("#btnCreate");
  const note = container.querySelector("#autoDetectNote");

  folderSelect.onchange = async () => {
    const weekId = folderSelect.value;
    if (!weekId) { btnCreate.disabled = true; topicInput.value = ""; note.textContent = ""; return; }

    try {
      const res = await fetch(`/api/publish/week/${weekId}`);
      if (res.ok) {
        note.textContent = "⚠ 이미 등록된 주입니다. 등록하면 기존 데이터를 덮어씁니다.";
        note.style.color = "var(--warning)";
      } else {
        note.textContent = "";
      }
    } catch { note.textContent = ""; }

    try {
      const res = await fetch(`/api/output/${weekId}/summary.md`);
      if (res.ok) {
        const text = await res.text();
        const match = text.match(/^#\s+(.+)$/m) || text.match(/[Tt]opic[:\s]+(.+)/);
        topicInput.value = match ? match[1].trim() : text.split("\n").find(l => l.trim()) || "";
        if (topicInput.value) { note.textContent = "✓ summary.md에서 주제를 자동으로 감지했습니다."; note.style.color = "var(--success)"; }
      }
    } catch { /* no summary */ }

    btnCreate.disabled = false;
  };

  btnCreate.onclick = async () => {
    const weekId = folderSelect.value;
    if (!weekId) return;
    btnCreate.disabled = true;
    btnCreate.textContent = "등록 중...";
    try {
      const res = await fetch("/api/publish/week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, topic: topicInput.value }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      showToast("주 등록 완료!", "success");
      location.hash = `#dashboard/${weekId}`;
    } catch (err) {
      showToast(err.message || "등록 실패", "error");
      btnCreate.disabled = false;
      btnCreate.textContent = "등록하기";
    }
  };
}

// ─── Screen 3: Week detail (list table) ──────────────────────────────────────
async function renderWeekDetail(container, weekId) {
  container.innerHTML = `
    <button class="db-back" id="btnBack">← 목록으로</button>
    <div id="detailBody"><div style="text-align:center;padding:40px;color:var(--text-muted)">불러오는 중...</div></div>
  `;
  container.querySelector("#btnBack").onclick = () => { location.hash = "#dashboard"; };

  // Load publish data (optional)
  let statusMap = {};
  let topic = weekId;
  try {
    const res = await fetch(`/api/publish/week/${weekId}`);
    if (res.ok) {
      const data = await res.json();
      topic = data.topic || weekId;
      for (const c of (data.contents || [])) {
        statusMap[c.id] = { status: c.status, publishedUrl: c.publishedUrl };
      }
    }
  } catch { /* ignore */ }

  const el = container.querySelector("#detailBody");
  const publishedCount = PUBLISH_ITEMS.filter(item => statusMap[item.id]?.status === "published").length;

  const rows = PUBLISH_ITEMS.map(item => {
    const status = statusMap[item.id]?.status || "draft";
    return `
      <tr class="publish-item-row" data-id="${item.id}" data-route="${item.route || ""}">
        <td><span class="item-icon">${item.icon}</span>${item.label}</td>
        <td class="item-channel">${item.channel}</td>
        <td>${renderItemBadge(status)}</td>
        <td class="item-arrow">→</td>
      </tr>`;
  }).join("");

  el.innerHTML = `
    <div class="db-week-header">
      <div>
        <h2>${topic}</h2>
        <div class="db-week-sub">${weekId}</div>
      </div>
      <div class="db-publish-stat">
        <span class="db-publish-num">${publishedCount}</span>
        <span class="db-publish-denom">/${PUBLISH_ITEMS.length} 발행 완료</span>
      </div>
    </div>
    <div class="week-table-wrap">
      <table class="week-table">
        <thead><tr>
          <th>콘텐츠</th><th>채널</th><th>상태</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  el.querySelectorAll(".publish-item-row").forEach(row => {
    row.style.cursor = "pointer";
    row.onclick = () => {
      const route = row.dataset.route;
      if (route) {
        location.hash = `#dashboard/${weekId}/${route}`;
      } else {
        showToast("준비 중입니다", "default");
      }
    };
  });
}

function renderItemBadge(status) {
  if (status === "published") return `<span class="item-badge published">🟢 발행 완료</span>`;
  if (status === "ready")     return `<span class="item-badge ready">🔵 발행 준비</span>`;
  return `<span class="item-badge draft">⚪ 이전</span>`;
}

// ─── Screen 4: blog-en publish page ──────────────────────────────────────────
async function renderBlogEnPublish(container, weekId) {
  container.innerHTML = `
    <button class="db-back" id="btnBack">← ${weekId} 상세로</button>
    <div id="publishBody"><div style="text-align:center;padding:40px;color:var(--text-muted)">콘텐츠 불러오는 중...</div></div>
  `;
  container.querySelector("#btnBack").onclick = () => { location.hash = `#dashboard/${weekId}`; };

  let blogData;
  try {
    const res = await fetch(`/api/publish/week/${weekId}/content/blog-en`);
    if (!res.ok) throw new Error((await res.json()).error);
    blogData = await res.json();
  } catch (err) {
    container.querySelector("#publishBody").innerHTML = `<p style="color:var(--error);padding:16px">blog-en.md를 찾을 수 없습니다: ${err.message}</p>`;
    return;
  }

  // Check existing publish state
  let existingState = null;
  try {
    const res = await fetch(`/api/publish/week/${weekId}`);
    if (res.ok) {
      const data = await res.json();
      existingState = data.contents?.find(c => c.id === "blog-en");
    }
  } catch { /* ignore */ }

  const isPublished = existingState?.status === "published";
  const publishedUrl = existingState?.publishedUrl;
  const blogUrl = blogData.blogUrl || "https://blog.perfectwin.ai";

  const statusBadge = isPublished
    ? `<span class="item-badge published" style="margin-left:10px">🟢 발행 완료</span>`
    : `<span class="item-badge draft" style="margin-left:10px">⚪ 이전</span>`;

  const el = container.querySelector("#publishBody");
  el.innerHTML = `
    <div style="max-width:720px">
      <div style="margin-bottom:28px">
        <h1 class="page-title" style="display:inline">영어 블로그 발행</h1>${statusBadge}
        <p class="page-subtitle" style="margin-top:6px">${weekId} · inblog으로 발행</p>
      </div>

      ${isPublished && publishedUrl ? `
        <div class="publish-result show" style="margin-bottom:20px">
          <h4>✓ 이미 발행된 포스트입니다</h4>
          <a href="${publishedUrl}" target="_blank">${publishedUrl}</a>
        </div>` : ""}

      <!-- 1. 제목 -->
      <div class="form-group">
        <label>제목</label>
        <input type="text" id="pubTitle" value="${esc(blogData.title)}" placeholder="블로그 제목을 입력하세요" />
      </div>

      <!-- 2. 슬러그 -->
      <div class="form-group">
        <label>슬러그 (URL)</label>
        <input type="text" id="pubSlug" value="${esc(blogData.slug)}" placeholder="url-slug" />
        <div class="slug-preview-line">${blogUrl}/<span id="slugPreview">${esc(blogData.slug)}</span></div>
      </div>

      <!-- 3. 서브텍스트 -->
      <div class="form-group">
        <label>서브텍스트 (Description)</label>
        <textarea id="pubDesc" rows="3" placeholder="SEO 설명 (최대 160자)">${esc(blogData.description)}</textarea>
        <div class="char-counter" id="descCounter">${(blogData.description || "").length}/160</div>
      </div>

      <!-- 4. 본문 -->
      <div class="form-group">
        <label>본문</label>
        <div class="publish-preview">
          <div class="preview-tabs">
            <button class="preview-tab active" data-tab="preview">미리보기</button>
            <button class="preview-tab" data-tab="edit">편집</button>
          </div>
          <div class="preview-body" id="previewHtml" style="min-height:400px;max-height:400px"></div>
          <textarea class="preview-body raw hidden" id="previewRaw" style="min-height:400px;max-height:400px;resize:vertical">${esc(blogData.markdown)}</textarea>
        </div>
      </div>

      <!-- 5. 썸네일 -->
      <div class="form-group">
        <label>썸네일 이미지</label>
        <input type="file" id="thumbInput" accept="image/png,image/jpeg,image/webp" style="display:none">
        <div id="thumbZone" class="thumb-drop-zone">
          ${blogData.hasThumbnail
            ? `<img src="${blogData.thumbnailUrl}?t=${Date.now()}" class="thumb-drop-img" id="thumbImg">`
            : `<div id="thumbEmpty" class="thumb-drop-empty">
                <div style="font-size:36px;margin-bottom:8px">🖼️</div>
                <div>이미지를 드래그하거나 클릭해서 업로드</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">PNG, JPG, WebP · 최대 10MB · 권장: 1200×630</div>
               </div>`}
        </div>
        ${blogData.hasThumbnail ? `<button class="btn-sm btn-secondary" id="btnChangeThumb" style="margin-top:8px">이미지 변경</button>` : ""}
      </div>

      <!-- 홈페이지 게시 섹션 -->
      <div class="framer-section">
        <label class="framer-toggle-wrap">
          <input type="checkbox" id="publishToFramer" checked>
          <span class="framer-toggle-label">🏠 홈페이지에도 게시</span>
          <span class="framer-toggle-sub">perfectwin.ai 블로그 카드 자동 추가 + 사이트 발행</span>
        </label>
        <div id="framerFields">
          <div class="form-group" style="margin-top:12px">
            <label>홈페이지 카드 제목</label>
            <input type="text" id="framerTitle" value="${esc(blogData.title)}" />
          </div>
          <div class="form-group">
            <label>홈페이지 카드 서브타이틀</label>
            <textarea id="framerSubtitle" rows="2">${esc(blogData.description)}</textarea>
          </div>
          <div class="form-group" style="display:flex;align-items:center;gap:10px">
            <input type="checkbox" id="framerFeatured" style="accent-color:var(--primary);width:16px;height:16px">
            <label style="margin-bottom:0;text-transform:none;font-size:13px;font-weight:500;letter-spacing:0;color:var(--text)">Featured (홈페이지 상단 노출)</label>
          </div>
        </div>
      </div>

      <!-- 발행 섹션 -->
      <div class="pub-action-area">
        <button class="btn-inblog" id="btnPublish" ${isPublished ? "disabled" : ""}>
          ${isPublished ? "✓ 발행 완료" : "📝 inblog에 발행"}
        </button>
        <p class="pub-helper-text">발행하면 ${blogUrl}에 즉시 게시됩니다</p>
        <div id="publishStatus"></div>
      </div>
    </div>
  `;

  // ── 미리보기 렌더링 ──
  const previewHtml = el.querySelector("#previewHtml");
  const previewRaw = el.querySelector("#previewRaw");
  renderMarkdownPreview(previewHtml, blogData.markdown);

  // 탭 전환
  el.querySelectorAll(".preview-tab").forEach(tab => {
    tab.onclick = () => {
      el.querySelectorAll(".preview-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const isPreview = tab.dataset.tab === "preview";
      previewHtml.classList.toggle("hidden", !isPreview);
      previewRaw.classList.toggle("hidden", isPreview);
      if (isPreview) renderMarkdownPreview(previewHtml, previewRaw.value);
    };
  });

  // ── 슬러그 자동 생성 ──
  const titleInput = el.querySelector("#pubTitle");
  const slugInput = el.querySelector("#pubSlug");
  const slugPreview = el.querySelector("#slugPreview");
  titleInput.oninput = () => {
    const auto = autoSlug(titleInput.value);
    slugInput.value = auto;
    slugPreview.textContent = auto;
  };
  slugInput.oninput = () => { slugPreview.textContent = slugInput.value; };

  // ── 설명 글자 수 ──
  const descTa = el.querySelector("#pubDesc");
  const descCounter = el.querySelector("#descCounter");
  descTa.oninput = () => {
    const len = descTa.value.length;
    descCounter.textContent = `${len}/160`;
    descCounter.classList.toggle("over", len > 160);
  };

  // ── 썸네일 업로드 ──
  const thumbInput = el.querySelector("#thumbInput");
  let currentThumbFile = null; // 새로 업로드한 파일명

  function setThumb(url) {
    const zone = el.querySelector("#thumbZone");
    zone.innerHTML = `<img src="${url}" class="thumb-drop-img" id="thumbImg">`;
    const btn = el.querySelector("#btnChangeThumb");
    if (btn) btn.textContent = "이미지 변경";
  }

  thumbInput.onchange = async () => {
    const file = thumbInput.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/publish/week/${weekId}/upload-thumbnail`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json();
      currentThumbFile = data.filename;
      setThumb(data.url + `?t=${Date.now()}`);
      showToast("썸네일 업로드 완료", "success");
    } catch { showToast("썸네일 업로드 실패", "error"); }
  };

  // 썸네일 영역 클릭 → 파일 선택
  el.querySelector("#thumbZone").onclick = () => thumbInput.click();
  el.querySelector("#btnChangeThumb")?.addEventListener("click", (e) => { e.stopPropagation(); thumbInput.click(); });

  // 드래그 앤 드롭
  const thumbZone = el.querySelector("#thumbZone");
  thumbZone.ondragover = (e) => { e.preventDefault(); thumbZone.classList.add("drag-over"); };
  thumbZone.ondragleave = () => thumbZone.classList.remove("drag-over");
  thumbZone.ondrop = (e) => {
    e.preventDefault();
    thumbZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    thumbInput.files = dt.files;
    thumbInput.dispatchEvent(new Event("change"));
  };

  // ── Framer 체크박스 토글 ──
  const framerCheck = el.querySelector("#publishToFramer");
  const framerFields = el.querySelector("#framerFields");
  framerCheck.onchange = () => {
    framerFields.style.display = framerCheck.checked ? "" : "none";
  };

  // ── 발행 버튼 ──
  el.querySelector("#btnPublish").onclick = async () => {
    const btn = el.querySelector("#btnPublish");
    const statusEl = el.querySelector("#publishStatus");
    const markdown = previewRaw.classList.contains("hidden") ? blogData.markdown : previewRaw.value;
    const useFramer = framerCheck.checked;

    btn.disabled = true;
    btn.innerHTML = `<div class="btn-spinner"></div> 발행 중...`;
    statusEl.innerHTML = "";

    let thumbnailPath = null;
    if (currentThumbFile) {
      thumbnailPath = `images/${currentThumbFile}`;
    } else if (blogData.hasThumbnail) {
      thumbnailPath = "images/blog-thumbnail.png";
    }

    try {
      const res = await fetch("/api/publish/inblog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekId,
          title: el.querySelector("#pubTitle").value,
          slug: el.querySelector("#pubSlug").value,
          description: descTa.value,
          contentMarkdown: markdown,
          thumbnailPath,
          publishNow: true,
          publishToFramer: useFramer,
          framerTitle: useFramer ? el.querySelector("#framerTitle").value : undefined,
          framerSubtitle: useFramer ? el.querySelector("#framerSubtitle").value : undefined,
          framerFeatured: useFramer ? el.querySelector("#framerFeatured").checked : false,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      btn.textContent = "✓ 발행 완료";

      // 결과 표시
      const framerLine = result.framer
        ? result.framer.success
          ? `<div style="margin-top:8px">✓ 홈페이지 게시 완료</div>`
          : `<div style="margin-top:8px;color:#B45309">⚠ 홈페이지 게시 실패: ${esc(result.framer.error)}</div>`
        : "";

      statusEl.innerHTML = `
        <div class="publish-result show">
          <h4>✓ 발행이 완료되었습니다!</h4>
          <a href="${result.publishedUrl}" target="_blank">${result.publishedUrl}</a>
          ${framerLine}
        </div>`;
      showToast("inblog 발행 완료!", "success");
      if (result.framer?.success) showToast("홈페이지 게시 완료!", "success");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "📝 inblog에 발행";
      statusEl.innerHTML = `
        <div style="color:var(--error);font-size:13px;padding:10px;background:#FEF2F2;border-radius:6px;border:1px solid #FECACA">
          ✕ 발행 실패: ${esc(err.message)}
        </div>`;
    }
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function autoSlug(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderMarkdownPreview(el, markdown) {
  let html = markdown
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#### (.+)$/gm, "<h5>$1</h5>")
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^---$/gm, "<hr>")
    .replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^(?!<[h2345|b|u|o|l|p|c|i|s|hr|blockquote])(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
  el.innerHTML = html;
}

function esc(str) {
  return (str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
