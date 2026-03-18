import { showToast } from "../components/toast.js";

// 주차별 발행 아이템 (고정 목록)
const PUBLISH_ITEMS = [
  { id: "blog-en",              icon: "📄", label: "영어 블로그",              channel: "inblog",   route: "blog-en" },
  { id: "blog-ko",              icon: "📄", label: "한글 블로그",              channel: "inblog",   route: null },
  { id: "linkedin-company-1",   icon: "💼", label: "LinkedIn Company Post 1", channel: "Buffer",   route: "linkedin-company/1" },
  { id: "linkedin-company-2",   icon: "💼", label: "LinkedIn Company Post 2", channel: "Buffer",   route: "linkedin-company/2" },
  { id: "linkedin-personal-1",  icon: "🤝", label: "LinkedIn Personal Post 1",channel: "Buffer",   route: "linkedin-personal/1" },
  { id: "linkedin-personal-2",  icon: "🤝", label: "LinkedIn Personal Post 2",channel: "Buffer",   route: "linkedin-personal/2" },
  { id: "x-post-1",             icon: "🐦", label: "X Post 1",               channel: "Buffer",   route: "x-post/1" },
  { id: "x-post-2",             icon: "🐦", label: "X Post 2",               channel: "Buffer",   route: "x-post/2" },
  { id: "x-post-3",             icon: "🐦", label: "X Post 3",               channel: "Buffer",   route: "x-post/3" },
  { id: "x-post-4",             icon: "🐦", label: "X Post 4",               channel: "Buffer",   route: "x-post/4" },
  { id: "x-post-5",             icon: "🐦", label: "X Post 5",               channel: "Buffer",   route: "x-post/5" },
  { id: "x-thread",             icon: "🧵", label: "X Thread",               channel: "Buffer",   route: "x-thread" },
  { id: "homepage-card",        icon: "🏠", label: "홈페이지 블로그 카드",    channel: "Framer",   route: null },
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
      } else if (contentRoute.startsWith("linkedin-company/") || contentRoute.startsWith("linkedin-personal/")) {
        const parts = contentRoute.split("/");
        const type = parts[0];
        const postNum = parseInt(parts[1], 10);
        renderLinkedInPublish(container, weekId, type, postNum);
      } else if (contentRoute.startsWith("x-post/")) {
        const postNum = parseInt(contentRoute.split("/")[1], 10);
        renderXPostPublish(container, weekId, postNum);
      } else if (contentRoute === "x-thread") {
        renderXThreadPublish(container, weekId);
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

// ─── Screen 5: LinkedIn publish page ──────────────────────────────────────────

// ─── Screen 5: LinkedIn publish page ──────────────────────────────────────────
async function renderLinkedInPublish(container, weekId, contentType, postNum) {
  if (contentType === "linkedin-company") {
    await renderCompanyLinkedInPublish(container, weekId, postNum);
  } else {
    await renderPersonalLinkedInPublish(container, weekId, postNum);
  }
}

// ─── Company: tabbed UI (캐러셀 + 단일 이미지) ───────────────────────────────
async function renderCompanyLinkedInPublish(container, weekId, postNum) {
  container.innerHTML = `
    <button class="db-back" id="btnBack">&larr; ${weekId} 상세로</button>
    <div id="publishBody"><div style="text-align:center;padding:40px;color:var(--text-muted)">콘텐츠 불러오는 중...</div></div>
  `;
  container.querySelector("#btnBack").onclick = () => { location.hash = `#dashboard/${weekId}`; };

  // Load carousel + single-image data
  let carouselData = null;
  try {
    const res = await fetch(`/api/linkedin/carousel/${weekId}/${postNum}`);
    if (res.ok) carouselData = await res.json();
  } catch { /* no carousel */ }

  // Load post text (for single-image tab textarea default)
  let postData = { text: "", hasImage: false, imageUrl: null };
  try {
    const res = await fetch(`/api/publish/week/${weekId}/content/linkedin-company/${postNum}`);
    if (res.ok) postData = await res.json();
  } catch { /* ignore */ }

  // Load Buffer company channel
  let targetProfile = null;
  try {
    const res = await fetch("/api/buffer/profiles");
    if (res.ok) {
      const data = await res.json();
      targetProfile = (data.profiles || []).find(p => p.service === "linkedin" && p.serviceType === "page")
        || (data.profiles || []).find(p => p.service === "linkedin") || null;
    }
  } catch { /* ignore */ }

  // Existing publish state
  let existingState = null;
  try {
    const res = await fetch(`/api/publish/week/${weekId}`);
    if (res.ok) {
      const data = await res.json();
      existingState = data.contents?.find(c => c.id === `linkedin-company-${postNum}`);
    }
  } catch { /* ignore */ }

  const isPublished = existingState?.status === "published";
  const statusBadge = isPublished
    ? `<span class="item-badge published" style="margin-left:10px">🟢 발행 완료</span>`
    : `<span class="item-badge draft" style="margin-left:10px">⚪ 미발행</span>`;

  const profileInfo = targetProfile
    ? `<div class="buffer-profile-info">
        ${targetProfile.avatar ? `<img src="${esc(targetProfile.avatar)}" class="buffer-avatar">` : ""}
        <span>${esc(targetProfile.name)}</span>
        <span class="buffer-profile-type">Company Page</span>
       </div>`
    : `<div class="buffer-profile-info buffer-no-profile">Buffer에 연결된 LinkedIn 회사 페이지가 없습니다</div>`;

  const el = container.querySelector("#publishBody");

  // Slide cards preview HTML
  let slideCardsHTML = "";
  let captionDefault = "";
  if (carouselData && carouselData.slides && carouselData.slides.length) {
    captionDefault = carouselData.caption || "";
    const themes = ["navy", "white", "lightblue"];
    function cardTheme(i, total) {
      const n = i + 1;
      if (n === 1 || n === total) return "navy";
      return n % 2 === 0 ? "white" : "lightblue";
    }
    slideCardsHTML = `
      <div class="slide-strip">
        ${carouselData.slides.map((s, i) => {
          const theme = cardTheme(i, carouselData.slides.length);
          const preview = s.content.split("\n").filter(l => l.trim()).slice(0, 2).join(" / ");
          return `<div class="slide-card slide-card-${theme}">
            <div class="slide-card-num">${String(i+1).padStart(2,"0")}</div>
            <div class="slide-card-title">${esc(s.title || "")}</div>
            <div class="slide-card-preview">${esc(preview)}</div>
          </div>`;
        }).join("")}
      </div>`;
  } else {
    slideCardsHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0">캐러셀 데이터를 찾을 수 없습니다. 콘텐츠에 Option 1: Carousel 섹션이 있는지 확인하세요.</p>`;
  }

  // Single image body text default
  const singleBodyDefault = carouselData?.singleImage?.bodyText || postData.text || "";

  el.innerHTML = `
    <div style="max-width:760px">
      <div style="margin-bottom:20px">
        <h1 class="page-title" style="display:inline">LinkedIn Company Post ${postNum}</h1>${statusBadge}
        <p class="page-subtitle" style="margin-top:6px">${weekId} &middot; LG CNS 회사 계정 &middot; Buffer 발행</p>
      </div>

      ${isPublished ? `
        <div class="publish-result show" style="margin-bottom:20px">
          <h4>&#10003; 이미 발행된 포스트입니다</h4>
          <p style="font-size:13px;color:#166534">Buffer ID: ${esc(existingState?.bufferId || "N/A")}</p>
        </div>` : ""}

      <div class="form-group">
        <label>발행 채널</label>
        ${profileInfo}
      </div>

      <!-- 탭 -->
      <div class="carousel-tabs">
        <button class="carousel-tab-btn active" data-tab="carousel">🎠 캐러셀 (PDF)</button>
        <button class="carousel-tab-btn" data-tab="single">🖼 단일 이미지</button>
      </div>

      <!-- ══ 캐러셀 탭 ══ -->
      <div class="carousel-tab-content" id="tabCarousel">

        <!-- 슬라이드 미리보기 -->
        <div class="form-group">
          <label>슬라이드 미리보기 (${carouselData?.totalSlides || 0}장)</label>
          ${slideCardsHTML}
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            <a class="btn-sm btn-secondary" href="/api/linkedin/carousel-html/${weekId}/${postNum}" target="_blank">
              🔍 HTML 미리보기
            </a>
          </div>
        </div>

        <!-- PDF 생성 -->
        <div class="form-group">
          <label>PDF 생성</label>
          <div class="pdf-action-row">
            <button class="btn-sm btn-primary" id="btnGenPdf" ${!carouselData ? "disabled" : ""}>
              📄 PDF 생성
            </button>
            <div id="pdfStatus" class="pdf-status"></div>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin-top:6px">
            Playwright로 슬라이드 ${carouselData?.totalSlides || 0}장을 1개 PDF로 변환합니다 (1080×1350px)
          </p>
        </div>

        <!-- 캡션 -->
        <div class="form-group">
          <label>캡션 (Buffer 발행 텍스트)</label>
          <textarea id="carouselCaption" rows="8" style="line-height:1.7">${esc(captionDefault)}</textarea>
          <div class="char-counter" id="carouselCharCounter">${captionDefault.length}/3,000</div>
        </div>

        <!-- 발행 옵션 -->
        <div class="form-group">
          <label>발행 옵션</label>
          <div class="publish-mode-select">
            <label class="publish-mode-option">
              <input type="radio" name="carouselMode" value="now" checked>
              <div><div class="option-label">즉시 발행</div><div class="option-sub">Buffer 큐의 다음 슬롯으로 즉시 발행</div></div>
            </label>
            <label class="publish-mode-option">
              <input type="radio" name="carouselMode" value="scheduled">
              <div><div class="option-label">예약 발행</div><div class="option-sub">지정한 날짜/시간에 발행</div></div>
            </label>
            <label class="publish-mode-option">
              <input type="radio" name="carouselMode" value="queue">
              <div><div class="option-label">Buffer 큐에 추가</div><div class="option-sub">Buffer 기본 스케줄에 따라 자동 발행</div></div>
            </label>
          </div>
        </div>
        <div class="form-group" id="carouselScheduledGroup" style="display:none">
          <label>예약 시간</label>
          <input type="datetime-local" id="carouselScheduledAt" />
        </div>

        <div class="pub-action-area">
          <button class="btn-buffer" id="btnCarouselPublish" ${isPublished || !targetProfile ? "disabled" : ""}>
            ${isPublished ? "&#10003; 발행 완료" : "🚀 Buffer로 캡션 발행"}
          </button>
          <p class="pub-helper-text">캡션 텍스트만 Buffer에 발행됩니다. PDF는 LinkedIn에 별도 첨부하세요.</p>
          <div id="carouselPublishStatus"></div>
        </div>
      </div>

      <!-- ══ 단일 이미지 탭 ══ -->
      <div class="carousel-tab-content" id="tabSingle" style="display:none">

        <div class="form-group">
          <label>포스트 텍스트</label>
          <textarea id="singlePostText" rows="12" style="line-height:1.7">${esc(singleBodyDefault)}</textarea>
          <div class="char-counter" id="singleCharCounter">${(singleBodyDefault).length}/3,000</div>
        </div>

        <div class="form-group">
          <label>이미지 (선택사항)</label>
          <input type="file" id="singleImageInput" accept="image/png,image/jpeg,image/webp" style="display:none">
          <div id="singleImageZone" class="thumb-drop-zone li-image-zone">
            ${postData.hasImage && postData.imageUrl
              ? `<img src="${postData.imageUrl}?t=${Date.now()}" class="thumb-drop-img li-image-preview">`
              : `<div class="thumb-drop-empty">
                  <div style="font-size:36px;margin-bottom:8px">🖼</div>
                  <div>이미지를 드래그하거나 클릭해서 업로드</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:4px">PNG, JPG, WebP &middot; 권장: 1200×627 또는 1080×1080</div>
                 </div>`}
          </div>
        </div>

        <div class="form-group">
          <label>발행 옵션</label>
          <div class="publish-mode-select">
            <label class="publish-mode-option">
              <input type="radio" name="singleMode" value="now" checked>
              <div><div class="option-label">즉시 발행</div><div class="option-sub">Buffer 큐의 다음 슬롯으로 즉시 발행</div></div>
            </label>
            <label class="publish-mode-option">
              <input type="radio" name="singleMode" value="scheduled">
              <div><div class="option-label">예약 발행</div><div class="option-sub">지정한 날짜/시간에 발행</div></div>
            </label>
            <label class="publish-mode-option">
              <input type="radio" name="singleMode" value="queue">
              <div><div class="option-label">Buffer 큐에 추가</div><div class="option-sub">Buffer 기본 스케줄에 따라 자동 발행</div></div>
            </label>
          </div>
        </div>
        <div class="form-group" id="singleScheduledGroup" style="display:none">
          <label>예약 시간</label>
          <input type="datetime-local" id="singleScheduledAt" />
        </div>

        <div class="pub-action-area">
          <button class="btn-buffer" id="btnSinglePublish" ${isPublished || !targetProfile ? "disabled" : ""}>
            ${isPublished ? "&#10003; 발행 완료" : "🚀 Buffer로 발행"}
          </button>
          <p class="pub-helper-text">${targetProfile ? `발행 대상: ${esc(targetProfile.name)} (Company Page)` : "Buffer 프로필을 먼저 연결하세요"}</p>
          <div id="singlePublishStatus"></div>
        </div>
      </div>
    </div>
  `;

  // ── 탭 전환 ──
  el.querySelectorAll(".carousel-tab-btn").forEach(btn => {
    btn.onclick = () => {
      el.querySelectorAll(".carousel-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      el.querySelector("#tabCarousel").style.display = tab === "carousel" ? "" : "none";
      el.querySelector("#tabSingle").style.display   = tab === "single"   ? "" : "none";
    };
  });

  // ── 캐러셀 글자 수 ──
  const captionTA = el.querySelector("#carouselCaption");
  const captionCounter = el.querySelector("#carouselCharCounter");
  captionTA.oninput = () => {
    const len = captionTA.value.length;
    captionCounter.textContent = `${len.toLocaleString()}/3,000`;
    captionCounter.classList.toggle("over", len > 3000);
  };

  // ── 단일 이미지 글자 수 ──
  const singleTA = el.querySelector("#singlePostText");
  const singleCounter = el.querySelector("#singleCharCounter");
  singleTA.oninput = () => {
    const len = singleTA.value.length;
    singleCounter.textContent = `${len.toLocaleString()}/3,000`;
    singleCounter.classList.toggle("over", len > 3000);
  };

  // ── 단일 이미지 업로드 ──
  const singleImageInput = el.querySelector("#singleImageInput");
  let singleImageFile = postData.hasImage ? `images/linkedin-company-${postNum}.png` : null;

  singleImageInput.onchange = async () => {
    const file = singleImageInput.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/publish/week/${weekId}/upload`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json();
      singleImageFile = data.path;
      el.querySelector("#singleImageZone").innerHTML =
        `<img src="/api/publish/week/${weekId}/file/${data.filename}?t=${Date.now()}" class="thumb-drop-img li-image-preview">`;
      showToast("이미지 업로드 완료", "success");
    } catch { showToast("이미지 업로드 실패", "error"); }
  };
  el.querySelector("#singleImageZone").onclick = () => singleImageInput.click();

  // ── 발행 옵션 토글 ──
  el.querySelectorAll("input[name=carouselMode]").forEach(r => {
    r.onchange = () => {
      el.querySelector("#carouselScheduledGroup").style.display =
        r.value === "scheduled" && r.checked ? "" : "none";
    };
  });
  el.querySelectorAll("input[name=singleMode]").forEach(r => {
    r.onchange = () => {
      el.querySelector("#singleScheduledGroup").style.display =
        r.value === "scheduled" && r.checked ? "" : "none";
    };
  });

  // ── PDF 생성 ──
  el.querySelector("#btnGenPdf").onclick = async () => {
    const btn = el.querySelector("#btnGenPdf");
    const statusEl = el.querySelector("#pdfStatus");
    btn.disabled = true;
    btn.innerHTML = `<div class="btn-spinner"></div> 생성 중...`;
    statusEl.innerHTML = "";

    try {
      const res = await fetch("/api/linkedin/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekId, postNum }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      btn.textContent = "✓ PDF 생성 완료";
      statusEl.innerHTML = `
        <div class="pdf-download-box">
          <span>📄 ${esc(result.filename)}</span>
          <a class="btn-sm btn-primary" href="${esc(result.downloadUrl)}" download>⬇ 다운로드</a>
        </div>`;
      showToast("PDF 생성 완료!", "success");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "📄 PDF 생성";
      statusEl.innerHTML = `<div style="color:var(--error);font-size:13px;padding:8px;background:#FEF2F2;border-radius:6px">✕ ${esc(err.message)}</div>`;
    }
  };

  // ── 캐러셀 캡션 발행 ──
  el.querySelector("#btnCarouselPublish").onclick = async () => {
    const btn = el.querySelector("#btnCarouselPublish");
    const statusEl = el.querySelector("#carouselPublishStatus");
    const mode = el.querySelector("input[name=carouselMode]:checked").value;
    const scheduledAt = mode === "scheduled" ? el.querySelector("#carouselScheduledAt").value : null;
    if (mode === "scheduled" && !scheduledAt) { showToast("예약 시간을 선택하세요", "warning"); return; }

    btn.disabled = true;
    btn.innerHTML = `<div class="btn-spinner"></div> 발행 중...`;
    statusEl.innerHTML = "";

    try {
      const res = await fetch("/api/publish/buffer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: weekId,
          contentType: "linkedin-company",
          postNum,
          text: captionTA.value,
          channelId: targetProfile.id,
          mode,
          dueAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      btn.textContent = "✓ 발행 완료";
      const statusLabel = { sent: "즉시 발행됨", scheduled: `예약됨 (${scheduledAt})`, buffer: "Buffer 큐에 추가됨" }[result.status] || result.status;
      statusEl.innerHTML = `
        <div class="publish-result show">
          <h4>&#10003; Buffer에 발행되었습니다!</h4>
          <p style="font-size:13px;color:#166534">${statusLabel}</p>
          ${result.bufferId ? `<p style="font-size:12px;color:var(--text-muted);margin-top:4px">Buffer ID: ${esc(result.bufferId)}</p>` : ""}
        </div>`;
      showToast("Buffer 발행 완료!", "success");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "🚀 Buffer로 캡션 발행";
      statusEl.innerHTML = `<div style="color:var(--error);font-size:13px;padding:10px;background:#FEF2F2;border-radius:6px;border:1px solid #FECACA">✕ 발행 실패: ${esc(err.message)}</div>`;
    }
  };

  // ── 단일 이미지 발행 ──
  el.querySelector("#btnSinglePublish").onclick = async () => {
    const btn = el.querySelector("#btnSinglePublish");
    const statusEl = el.querySelector("#singlePublishStatus");
    const mode = el.querySelector("input[name=singleMode]:checked").value;
    const scheduledAt = mode === "scheduled" ? el.querySelector("#singleScheduledAt").value : null;
    if (mode === "scheduled" && !scheduledAt) { showToast("예약 시간을 선택하세요", "warning"); return; }

    btn.disabled = true;
    btn.innerHTML = `<div class="btn-spinner"></div> 발행 중...`;
    statusEl.innerHTML = "";

    try {
      // Resolve image URL if uploaded
      let imageUrl = null;
      if (singleImageFile) {
        const imgFilename = singleImageFile.replace(/^.*[\\/]/, "");
        const imgRes = await fetch(`/api/publish/week/${weekId}/file/${imgFilename}`, { method: "HEAD" });
        if (imgRes.ok) imageUrl = `http://localhost:3000/api/publish/week/${weekId}/file/${imgFilename}`;
      }

      const res = await fetch("/api/publish/buffer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: weekId,
          contentType: "linkedin-company",
          postNum,
          text: singleTA.value,
          channelId: targetProfile.id,
          mode,
          dueAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          imageUrl,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      btn.textContent = "✓ 발행 완료";
      const statusLabel = { sent: "즉시 발행됨", scheduled: `예약됨 (${scheduledAt})`, buffer: "Buffer 큐에 추가됨" }[result.status] || result.status;
      statusEl.innerHTML = `
        <div class="publish-result show">
          <h4>&#10003; Buffer에 발행되었습니다!</h4>
          <p style="font-size:13px;color:#166534">${statusLabel}</p>
          ${result.bufferId ? `<p style="font-size:12px;color:var(--text-muted);margin-top:4px">Buffer ID: ${esc(result.bufferId)}</p>` : ""}
        </div>`;
      showToast("Buffer 발행 완료!", "success");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "🚀 Buffer로 발행";
      statusEl.innerHTML = `<div style="color:var(--error);font-size:13px;padding:10px;background:#FEF2F2;border-radius:6px;border:1px solid #FECACA">✕ 발행 실패: ${esc(err.message)}</div>`;
    }
  };
}

// ─── Personal (ARUM): 기존 텍스트+이미지 플로우 ──────────────────────────────
async function renderPersonalLinkedInPublish(container, weekId, postNum) {
  const typeLabel = "LinkedIn Personal";

  container.innerHTML = `
    <button class="db-back" id="btnBack">&larr; ${weekId} 상세로</button>
    <div id="publishBody"><div style="text-align:center;padding:40px;color:var(--text-muted)">콘텐츠 불러오는 중...</div></div>
  `;
  container.querySelector("#btnBack").onclick = () => { location.hash = `#dashboard/${weekId}`; };

  let postData;
  try {
    const res = await fetch(`/api/publish/week/${weekId}/content/linkedin-personal/${postNum}`);
    if (!res.ok) throw new Error((await res.json()).error);
    postData = await res.json();
  } catch (err) {
    container.querySelector("#publishBody").innerHTML =
      `<p style="color:var(--error);padding:16px">linkedin-personal.md를 찾을 수 없습니다: ${esc(err.message)}</p>`;
    return;
  }

  let targetProfile = null;
  try {
    const res = await fetch("/api/buffer/profiles");
    if (res.ok) {
      const data = await res.json();
      targetProfile = (data.profiles || []).find(p => p.service === "linkedin" && p.serviceType === "profile")
        || (data.profiles || []).find(p => p.service === "linkedin") || null;
    }
  } catch { /* ignore */ }

  let existingState = null;
  try {
    const res = await fetch(`/api/publish/week/${weekId}`);
    if (res.ok) {
      const data = await res.json();
      existingState = data.contents?.find(c => c.id === `linkedin-personal-${postNum}`);
    }
  } catch { /* ignore */ }

  const isPublished = existingState?.status === "published";
  const statusBadge = isPublished
    ? `<span class="item-badge published" style="margin-left:10px">🟢 발행 완료</span>`
    : `<span class="item-badge draft" style="margin-left:10px">⚪ 미발행</span>`;

  const profileInfo = targetProfile
    ? `<div class="buffer-profile-info">
        ${targetProfile.avatar ? `<img src="${esc(targetProfile.avatar)}" class="buffer-avatar">` : ""}
        <span>${esc(targetProfile.name)}</span>
        <span class="buffer-profile-type">Personal Profile (ARUM)</span>
       </div>`
    : `<div class="buffer-profile-info buffer-no-profile">Buffer에 연결된 LinkedIn 개인 프로필이 없습니다</div>`;

  const el = container.querySelector("#publishBody");
  el.innerHTML = `
    <div style="max-width:720px">
      <div style="margin-bottom:28px">
        <h1 class="page-title" style="display:inline">${typeLabel} Post ${postNum}</h1>${statusBadge}
        <p class="page-subtitle" style="margin-top:6px">${weekId} &middot; ARUM 개인 계정 &middot; Buffer 발행</p>
      </div>

      ${isPublished ? `
        <div class="publish-result show" style="margin-bottom:20px">
          <h4>&#10003; 이미 발행된 포스트입니다</h4>
          <p style="font-size:13px;color:#166534">Buffer ID: ${esc(existingState?.bufferId || "N/A")}</p>
        </div>` : ""}

      <div class="form-group">
        <label>발행 채널</label>
        ${profileInfo}
      </div>

      <div class="form-group">
        <label>포스트 텍스트</label>
        <textarea id="liPostText" rows="12" style="line-height:1.7">${esc(postData.text)}</textarea>
        <div class="char-counter" id="liCharCounter">${(postData.text || "").length}/3,000</div>
      </div>

      <div class="form-group">
        <label>이미지 (선택사항)</label>
        <input type="file" id="liImageInput" accept="image/png,image/jpeg,image/webp" style="display:none">
        <div id="liImageZone" class="thumb-drop-zone li-image-zone">
          ${postData.hasImage && postData.imageUrl
            ? `<img src="${postData.imageUrl}?t=${Date.now()}" class="thumb-drop-img li-image-preview" id="liImagePreview">`
            : `<div class="thumb-drop-empty">
                <div style="font-size:36px;margin-bottom:8px">🖼</div>
                <div>이미지를 드래그하거나 클릭해서 업로드</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">PNG, JPG, WebP &middot; 권장: 1200×627 또는 1080×1080</div>
               </div>`}
        </div>
        ${postData.hasImage ? `<button class="btn-sm btn-secondary" id="liChangeImage" style="margin-top:8px">이미지 변경</button>` : ""}
      </div>

      <div class="form-group">
        <label>발행 옵션</label>
        <div class="publish-mode-select">
          <label class="publish-mode-option">
            <input type="radio" name="publishMode" value="now" checked>
            <div><div class="option-label">즉시 발행</div><div class="option-sub">Buffer 큐의 다음 슬롯으로 즉시 발행</div></div>
          </label>
          <label class="publish-mode-option">
            <input type="radio" name="publishMode" value="scheduled">
            <div><div class="option-label">예약 발행</div><div class="option-sub">지정한 날짜/시간에 발행</div></div>
          </label>
          <label class="publish-mode-option">
            <input type="radio" name="publishMode" value="queue">
            <div><div class="option-label">Buffer 큐에 추가</div><div class="option-sub">Buffer 기본 스케줄에 따라 자동 발행</div></div>
          </label>
        </div>
      </div>
      <div class="form-group" id="scheduledAtGroup" style="display:none">
        <label>예약 시간</label>
        <input type="datetime-local" id="liScheduledAt" />
      </div>

      <div class="pub-action-area">
        <button class="btn-buffer" id="btnBufferPublish" ${isPublished || !targetProfile ? "disabled" : ""}>
          ${isPublished ? "&#10003; 발행 완료" : "🚀 Buffer로 발행"}
        </button>
        <p class="pub-helper-text">${targetProfile ? `발행 대상: ${esc(targetProfile.name)} (Personal)` : "Buffer 프로필을 먼저 연결하세요"}</p>
        <div id="bufferPublishStatus"></div>
      </div>
    </div>
  `;

  // ── 글자 수 ──
  const textArea = el.querySelector("#liPostText");
  const charCounter = el.querySelector("#liCharCounter");
  textArea.oninput = () => {
    const len = textArea.value.length;
    charCounter.textContent = `${len.toLocaleString()}/3,000`;
    charCounter.classList.toggle("over", len > 3000);
  };

  // ── 이미지 업로드 ──
  const imageInput = el.querySelector("#liImageInput");
  let currentImageFile = postData.hasImage ? `images/linkedin-personal-${postNum}.png` : null;

  imageInput.onchange = async () => {
    const file = imageInput.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/publish/week/${weekId}/upload`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json();
      currentImageFile = data.path;
      el.querySelector("#liImageZone").innerHTML =
        `<img src="/api/publish/week/${weekId}/file/${data.filename}?t=${Date.now()}" class="thumb-drop-img li-image-preview">`;
      showToast("이미지 업로드 완료", "success");
    } catch { showToast("이미지 업로드 실패", "error"); }
  };

  el.querySelector("#liImageZone").onclick = () => imageInput.click();
  el.querySelector("#liChangeImage")?.addEventListener("click", (e) => { e.stopPropagation(); imageInput.click(); });

  const imageZone = el.querySelector("#liImageZone");
  imageZone.ondragover = (e) => { e.preventDefault(); imageZone.classList.add("drag-over"); };
  imageZone.ondragleave = () => imageZone.classList.remove("drag-over");
  imageZone.ondrop = (e) => {
    e.preventDefault();
    imageZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    imageInput.files = dt.files;
    imageInput.dispatchEvent(new Event("change"));
  };

  // ── 발행 옵션 토글 ──
  const scheduledGroup = el.querySelector("#scheduledAtGroup");
  el.querySelectorAll("input[name=publishMode]").forEach(radio => {
    radio.onchange = () => {
      scheduledGroup.style.display = radio.value === "scheduled" && radio.checked ? "" : "none";
    };
  });

  // ── 발행 버튼 ──
  el.querySelector("#btnBufferPublish").onclick = async () => {
    const btn = el.querySelector("#btnBufferPublish");
    const statusEl = el.querySelector("#bufferPublishStatus");
    const publishMode = el.querySelector("input[name=publishMode]:checked").value;
    const scheduledAt = publishMode === "scheduled" ? el.querySelector("#liScheduledAt").value : null;
    if (publishMode === "scheduled" && !scheduledAt) { showToast("예약 시간을 선택하세요", "warning"); return; }

    btn.disabled = true;
    btn.innerHTML = `<div class="btn-spinner"></div> 발행 중...`;
    statusEl.innerHTML = "";

    try {
      let imageUrl = null;
      if (currentImageFile) {
        const imgFilename = currentImageFile.replace(/^.*[\\/]/, "");
        const imgRes = await fetch(`/api/publish/week/${weekId}/file/${imgFilename}`, { method: "HEAD" });
        if (imgRes.ok) imageUrl = `http://localhost:3000/api/publish/week/${weekId}/file/${imgFilename}`;
      }

      const res = await fetch("/api/publish/buffer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: weekId,
          contentType: "linkedin-personal",
          postNum,
          text: textArea.value,
          channelId: targetProfile.id,
          mode: publishMode,
          dueAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          imageUrl,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      btn.textContent = "✓ 발행 완료";
      const statusLabel = { sent: "즉시 발행됨", scheduled: `예약됨 (${scheduledAt})`, buffer: "Buffer 큐에 추가됨" }[result.status] || result.status;
      statusEl.innerHTML = `
        <div class="publish-result show">
          <h4>&#10003; Buffer에 발행되었습니다!</h4>
          <p style="font-size:13px;color:#166534">${statusLabel}</p>
          ${result.bufferId ? `<p style="font-size:12px;color:var(--text-muted);margin-top:4px">Buffer ID: ${esc(result.bufferId)}</p>` : ""}
        </div>`;
      showToast("Buffer 발행 완료!", "success");
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "🚀 Buffer로 발행";
      statusEl.innerHTML = `<div style="color:var(--error);font-size:13px;padding:10px;background:#FEF2F2;border-radius:6px;border:1px solid #FECACA">✕ 발행 실패: ${esc(err.message)}</div>`;
    }
  };
}async function renderXPostPublish(container, weekId, postNum) {
  container.innerHTML = `
    <button class="db-back" id="btnBack">&larr; ${weekId} 상세로</button>
    <div id="publishBody"><div style="text-align:center;padding:40px;color:var(--text-muted)">콘텐츠 불러오는 중...</div></div>
  `;
  container.querySelector("#btnBack").onclick = () => { location.hash = `#dashboard/${weekId}`; };

  let postData;
  try {
    const res = await fetch(`/api/publish/week/${weekId}/content/x-post/${postNum}`);
    if (!res.ok) throw new Error((await res.json()).error);
    postData = await res.json();
  } catch (err) {
    container.querySelector("#publishBody").innerHTML = `
      <p style="color:var(--error);padding:16px">x-posts.md를 찾을 수 없습니다: ${esc(err.message)}</p>`;
    return;
  }

  // Get X channel info
  let xChannel = null;
  try {
    const res = await fetch("/api/buffer/profiles");
    if (res.ok) {
      const data = await res.json();
      xChannel = (data.profiles || []).find(p => p.service === "x") || null;
    }
  } catch { /* ignore */ }

  // Check existing state
  let existingState = null;
  try {
    const res = await fetch(`/api/publish/week/${weekId}`);
    if (res.ok) {
      const data = await res.json();
      existingState = data.contents?.find(c => c.id === `x-post-${postNum}`);
    }
  } catch { /* ignore */ }

  const isPublished = existingState?.status === "published";
  const statusBadge = isPublished
    ? `<span class="item-badge published" style="margin-left:10px">🟢 발행 완료</span>`
    : `<span class="item-badge draft" style="margin-left:10px">⚪ 이전</span>`;

  const el = container.querySelector("#publishBody");
  el.innerHTML = `
    <div style="max-width:720px">
      <div style="margin-bottom:28px">
        <h1 class="page-title" style="display:inline">X Post ${postNum}</h1>${statusBadge}
        <p class="page-subtitle" style="margin-top:6px">${weekId} &middot; Buffer로 발행</p>
      </div>

      ${isPublished ? `
        <div class="publish-result show" style="margin-bottom:20px">
          <h4>&#10003; 이미 발행된 포스트입니다</h4>
          <p style="font-size:13px;color:#166534">Buffer ID: ${esc(existingState?.bufferId || "N/A")}</p>
        </div>` : ""}

      <div class="form-group">
        <label>발행 채널</label>
        <div class="buffer-profile-info">
          <span>${xChannel ? esc(xChannel.name) : "X Channel"}</span>
          <span class="buffer-profile-type">X / Twitter</span>
        </div>
      </div>

      <div class="form-group">
        <label>포스트 텍스트</label>
        <textarea id="xPostText" rows="4" style="line-height:1.7">${esc(postData.text)}</textarea>
        <div class="char-counter" id="xCharCounter">${(postData.text || "").length}/280</div>
      </div>

      <div class="form-group">
        <label>이미지 (선택사항)</label>
        <input type="file" id="xImageInput" accept="image/png,image/jpeg,image/webp" style="display:none">
        <div id="xImageZone" class="thumb-drop-zone li-image-zone">
          ${postData.hasImage && postData.imageUrl
            ? `<img src="${postData.imageUrl}?t=${Date.now()}" class="thumb-drop-img li-image-preview">`
            : `<div class="thumb-drop-empty">
                <div style="font-size:36px;margin-bottom:8px">🖼</div>
                <div>이미지를 드래그하거나 클릭해서 업로드</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">PNG, JPG, WebP</div>
               </div>`}
        </div>
      </div>

      <div class="form-group">
        <label>발행 옵션</label>
        <div class="publish-mode-select">
          <label class="publish-mode-option">
            <input type="radio" name="xPublishMode" value="now" checked>
            <div><div class="option-label">즉시 발행</div><div class="option-sub">바로 트윗</div></div>
          </label>
          <label class="publish-mode-option">
            <input type="radio" name="xPublishMode" value="scheduled">
            <div><div class="option-label">예약 발행</div><div class="option-sub">지정한 시간에 발행</div></div>
          </label>
          <label class="publish-mode-option">
            <input type="radio" name="xPublishMode" value="queue">
            <div><div class="option-label">큐에 추가</div><div class="option-sub">Buffer 기본 스케줄</div></div>
          </label>
        </div>
      </div>

      <div class="form-group" id="xScheduledAtGroup" style="display:none">
        <label>예약 시간</label>
        <input type="datetime-local" id="xScheduledAt" />
      </div>

      <div class="pub-action-area">
        <button class="btn-x" id="btnXPublish" ${isPublished || !xChannel ? "disabled" : ""}>
          ${isPublished ? "&#10003; 발행 완료" : "🚀 Buffer로 발행"}
        </button>
        <p class="pub-helper-text">${xChannel ? `발행 대상: ${esc(xChannel.name)} (X)` : "Buffer에 X 채널을 먼저 연결하세요"}</p>
        <div id="xPublishStatus"></div>
      </div>
    </div>
  `;

  // Char counter
  const textArea = el.querySelector("#xPostText");
  const charCounter = el.querySelector("#xCharCounter");
  textArea.oninput = () => {
    const len = textArea.value.length;
    charCounter.textContent = `${len}/280`;
    charCounter.classList.toggle("over", len > 280);
  };

  // Image upload
  const imageInput = el.querySelector("#xImageInput");
  el.querySelector("#xImageZone").onclick = () => imageInput.click();
  const imageZone = el.querySelector("#xImageZone");
  imageZone.ondragover = (e) => { e.preventDefault(); imageZone.classList.add("drag-over"); };
  imageZone.ondragleave = () => imageZone.classList.remove("drag-over");
  imageZone.ondrop = (e) => {
    e.preventDefault(); imageZone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dt = new DataTransfer(); dt.items.add(file);
    imageInput.files = dt.files; imageInput.dispatchEvent(new Event("change"));
  };
  imageInput.onchange = async () => {
    const file = imageInput.files[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const res = await fetch(`/api/publish/week/${weekId}/upload`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const data = await res.json();
      imageZone.innerHTML = `<img src="/api/publish/week/${weekId}/file/${data.filename}?t=${Date.now()}" class="thumb-drop-img li-image-preview">`;
      showToast("이미지 업로드 완료", "success");
    } catch { showToast("이미지 업로드 실패", "error"); }
  };

  // Schedule toggle
  const scheduledGroup = el.querySelector("#xScheduledAtGroup");
  el.querySelectorAll("input[name=xPublishMode]").forEach(radio => {
    radio.onchange = () => { scheduledGroup.style.display = radio.value === "scheduled" && radio.checked ? "" : "none"; };
  });

  // Publish button
  el.querySelector("#btnXPublish").onclick = async () => {
    const btn = el.querySelector("#btnXPublish");
    const statusEl = el.querySelector("#xPublishStatus");
    const mode = el.querySelector("input[name=xPublishMode]:checked").value;
    const scheduledAt = mode === "scheduled" ? el.querySelector("#xScheduledAt").value : null;

    if (mode === "scheduled" && !scheduledAt) { showToast("예약 시간을 선택하세요", "warning"); return; }

    btn.disabled = true;
    btn.innerHTML = `<div class="btn-spinner"></div> 발행 중...`;
    statusEl.innerHTML = "";

    try {
      const res = await fetch("/api/publish/buffer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: weekId, contentType: "x-post", postNum, text: textArea.value,
          channelId: xChannel.id, mode, dueAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      btn.textContent = "\u2713 발행 완료";
      const statusLabel = { sent: "즉시 발행됨", scheduled: `예약됨`, buffer: "큐에 추가됨" }[result.status] || result.status;
      statusEl.innerHTML = `
        <div class="publish-result show">
          <h4>&#10003; Buffer에 발행되었습니다!</h4>
          <p style="font-size:13px;color:#166534">${statusLabel}</p>
        </div>`;
      showToast("Buffer 발행 완료!", "success");
    } catch (err) {
      btn.disabled = false; btn.textContent = "🚀 Buffer로 발행";
      statusEl.innerHTML = `<div style="color:var(--error);font-size:13px;padding:10px;background:#FEF2F2;border-radius:6px;border:1px solid #FECACA">&#10005; 발행 실패: ${esc(err.message)}</div>`;
    }
  };
}

// ─── Screen 7: X Thread publish page ──────────────────────────────────────────
async function renderXThreadPublish(container, weekId) {
  container.innerHTML = `
    <button class="db-back" id="btnBack">&larr; ${weekId} 상세로</button>
    <div id="publishBody"><div style="text-align:center;padding:40px;color:var(--text-muted)">콘텐츠 불러오는 중...</div></div>
  `;
  container.querySelector("#btnBack").onclick = () => { location.hash = `#dashboard/${weekId}`; };

  let threadData;
  try {
    const res = await fetch(`/api/publish/week/${weekId}/content/x-thread`);
    if (!res.ok) throw new Error((await res.json()).error);
    threadData = await res.json();
  } catch (err) {
    container.querySelector("#publishBody").innerHTML = `
      <p style="color:var(--error);padding:16px">x-posts.md 스레드를 찾을 수 없습니다: ${esc(err.message)}</p>`;
    return;
  }

  let xChannel = null;
  try {
    const res = await fetch("/api/buffer/profiles");
    if (res.ok) {
      const data = await res.json();
      xChannel = (data.profiles || []).find(p => p.service === "x") || null;
    }
  } catch { /* ignore */ }

  let existingState = null;
  try {
    const res = await fetch(`/api/publish/week/${weekId}`);
    if (res.ok) {
      const data = await res.json();
      existingState = data.contents?.find(c => c.id === "x-thread");
    }
  } catch { /* ignore */ }

  const isPublished = existingState?.status === "published";
  const statusBadge = isPublished
    ? `<span class="item-badge published" style="margin-left:10px">🟢 발행 완료</span>`
    : `<span class="item-badge draft" style="margin-left:10px">⚪ 이전</span>`;

  const tweets = threadData.tweets || [];
  const tweetFields = tweets.map((t, i) => `
    <div class="thread-tweet-item">
      <div class="thread-tweet-num">${i + 1}</div>
      <div class="thread-tweet-body">
        <textarea class="thread-tweet-text" rows="3">${esc(t.text)}</textarea>
        <div class="char-counter thread-char-counter">${t.text.length}/280</div>
      </div>
    </div>
  `).join("");

  const el = container.querySelector("#publishBody");
  el.innerHTML = `
    <div style="max-width:720px">
      <div style="margin-bottom:28px">
        <h1 class="page-title" style="display:inline">X Thread</h1>${statusBadge}
        <p class="page-subtitle" style="margin-top:6px">${weekId} &middot; Buffer로 발행 &middot; ${tweets.length}개 트윗</p>
      </div>

      ${isPublished ? `
        <div class="publish-result show" style="margin-bottom:20px">
          <h4>&#10003; 이미 발행된 스레드입니다</h4>
        </div>` : ""}

      <div class="form-group">
        <label>발행 채널</label>
        <div class="buffer-profile-info">
          <span>${xChannel ? esc(xChannel.name) : "X Channel"}</span>
          <span class="buffer-profile-type">X / Twitter</span>
        </div>
      </div>

      <div class="form-group">
        <label>스레드 트윗 (${tweets.length}개)</label>
        <div class="thread-tweets-list" id="threadTweetsList">
          ${tweetFields}
        </div>
      </div>

      <div class="form-group">
        <label>발행 옵션</label>
        <div class="publish-mode-select">
          <label class="publish-mode-option">
            <input type="radio" name="threadMode" value="now" checked>
            <div><div class="option-label">즉시 발행</div><div class="option-sub">1분 간격으로 순차 트윗</div></div>
          </label>
          <label class="publish-mode-option">
            <input type="radio" name="threadMode" value="scheduled">
            <div><div class="option-label">예약 발행</div><div class="option-sub">지정 시간부터 1분 간격</div></div>
          </label>
          <label class="publish-mode-option">
            <input type="radio" name="threadMode" value="queue">
            <div><div class="option-label">큐에 추가</div><div class="option-sub">Buffer 기본 스케줄</div></div>
          </label>
        </div>
      </div>

      <div class="form-group" id="threadScheduledGroup" style="display:none">
        <label>예약 시간</label>
        <input type="datetime-local" id="threadScheduledAt" />
      </div>

      <div class="pub-action-area">
        <button class="btn-x" id="btnThreadPublish" ${isPublished || !xChannel ? "disabled" : ""}>
          ${isPublished ? "&#10003; 발행 완료" : "🚀 스레드 전체 발행"}
        </button>
        <p class="pub-helper-text">${tweets.length}개 트윗을 순차적으로 발행합니다</p>
        <div id="threadPublishStatus"></div>
      </div>
    </div>
  `;

  // Char counters for each tweet
  el.querySelectorAll(".thread-tweet-text").forEach(ta => {
    ta.oninput = () => {
      const counter = ta.parentElement.querySelector(".thread-char-counter");
      const len = ta.value.length;
      counter.textContent = `${len}/280`;
      counter.classList.toggle("over", len > 280);
    };
  });

  // Schedule toggle
  const scheduledGroup = el.querySelector("#threadScheduledGroup");
  el.querySelectorAll("input[name=threadMode]").forEach(radio => {
    radio.onchange = () => { scheduledGroup.style.display = radio.value === "scheduled" && radio.checked ? "" : "none"; };
  });

  // Publish
  el.querySelector("#btnThreadPublish").onclick = async () => {
    const btn = el.querySelector("#btnThreadPublish");
    const statusEl = el.querySelector("#threadPublishStatus");
    const mode = el.querySelector("input[name=threadMode]:checked").value;
    const scheduledAt = mode === "scheduled" ? el.querySelector("#threadScheduledAt").value : null;

    if (mode === "scheduled" && !scheduledAt) { showToast("예약 시간을 선택하세요", "warning"); return; }

    // Collect all tweet texts
    const tweetTexts = Array.from(el.querySelectorAll(".thread-tweet-text")).map(ta => ta.value);

    btn.disabled = true;
    btn.innerHTML = `<div class="btn-spinner"></div> 발행 중... (${tweetTexts.length}개 트윗)`;
    statusEl.innerHTML = "";

    try {
      const res = await fetch("/api/publish/buffer/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week: weekId, tweets: tweetTexts, channelId: xChannel.id,
          mode, dueAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      btn.textContent = "\u2713 발행 완료";
      statusEl.innerHTML = `
        <div class="publish-result show">
          <h4>&#10003; 스레드가 Buffer에 발행되었습니다!</h4>
          <p style="font-size:13px;color:#166534">${result.results?.length || tweetTexts.length}개 트윗 발행됨</p>
        </div>`;
      showToast("스레드 발행 완료!", "success");
    } catch (err) {
      btn.disabled = false; btn.textContent = "🚀 스레드 전체 발행";
      statusEl.innerHTML = `<div style="color:var(--error);font-size:13px;padding:10px;background:#FEF2F2;border-radius:6px;border:1px solid #FECACA">&#10005; 발행 실패: ${esc(err.message)}</div>`;
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
