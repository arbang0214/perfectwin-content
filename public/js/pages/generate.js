import { openModal, initModal } from "../components/modal.js";
import { refreshSidebarWeeks } from "../components/sidebar.js";

const TOPICS = [
  { id: "A1", cat: "a", catName: "S/4HANA Migration", topic: "S/4HANA 마이그레이션에서 테스트가 실패하는 5가지 이유", keywords: "SAP S/4HANA migration testing", angle: "Data Extractor로 실거래 데이터 기반 테스트" },
  { id: "A2", cat: "a", catName: "S/4HANA Migration", topic: "ECC 지원 종료 2027: 테스트 관점에서 지금 준비해야 할 것", keywords: "SAP ECC end of support testing", angle: "마이그레이션 테스트 자동화 필요성" },
  { id: "A3", cat: "a", catName: "S/4HANA Migration", topic: "S/4HANA 마이그레이션 테스트 체크리스트 (실무 가이드)", keywords: "S/4HANA testing checklist", angle: "Pre-built 비즈니스 프로세스 템플릿" },
  { id: "A4", cat: "a", catName: "S/4HANA Migration", topic: "마이그레이션 후 리그레션 테스트: 수동 vs 자동화 비교", keywords: "SAP regression testing automation", angle: "50배 빠른 백엔드 직접 전송" },
  { id: "B1", cat: "b", catName: "Test Automation", topic: "SAP 테스트 자동화 시작 가이드", keywords: "SAP test automation guide", angle: "No-code 드래그앤드롭 시나리오 생성" },
  { id: "B2", cat: "b", catName: "Test Automation", topic: "SAP 테스트 데이터 관리의 숨겨진 복잡성", keywords: "SAP test data management", angle: "Data Extractor로 실 프로덕션 데이터 추출" },
  { id: "B3", cat: "b", catName: "Test Automation", topic: "Order-to-Cash 프로세스 테스트 자동화 완전 가이드", keywords: "SAP order to cash testing", angle: "Pre-built O2C 템플릿" },
  { id: "B4", cat: "b", catName: "Test Automation", topic: "SAP 테스트 자동화 도구 선택 기준 (2026 업데이트)", keywords: "SAP test automation tools comparison", angle: "PerfecTwin 포지셔닝 (간접 비교)" },
  { id: "C1", cat: "c", catName: "Competitor Pain Points", topic: "SAP 테스트 자동화 비용을 줄이는 5가지 방법", keywords: "SAP test automation cost reduction", angle: "가격 경쟁력 (Tosca 대비)" },
  { id: "C2", cat: "c", catName: "Competitor Pain Points", topic: "UI Replay vs Backend Direct: SAP 테스트 실행 방식 비교", keywords: "SAP test execution speed", angle: "50배 속도 차이 (아키텍처 우위)" },
  { id: "C3", cat: "c", catName: "Competitor Pain Points", topic: "No-Code SAP 테스트 자동화가 필요한 진짜 이유", keywords: "no-code SAP testing", angle: "드래그앤드롭 UX" },
  { id: "C4", cat: "c", catName: "Competitor Pain Points", topic: "SAP 테스트 도구를 바꿔야 할 5가지 신호", keywords: "SAP testing tool switch", angle: "전환 CTA" },
  { id: "D1", cat: "d", catName: "Trends", topic: "2026 SAP 테스트 자동화 트렌드: AI, No-Code, Cloud", keywords: "SAP testing trends 2026", angle: "클라우드 버전 런칭 예고" },
  { id: "D2", cat: "d", catName: "Trends", topic: "SAP Fiori 테스트: 왜 기존 자동화 도구로는 부족한가", keywords: "SAP Fiori testing automation", angle: "크로스 플랫폼 테스트 지원" },
  { id: "D3", cat: "d", catName: "Trends", topic: "CI/CD 파이프라인에 SAP 테스트를 통합하는 방법", keywords: "SAP testing CI/CD integration", angle: "DevOps 연동 가능성" },
  { id: "D4", cat: "d", catName: "Trends", topic: "SAP 테스트 자동화 ROI 계산법 (경영진 설득용)", keywords: "SAP test automation ROI", angle: "TCO 비교 프레임워크" },
];

const FILE_DESC = {
  "blog-ko.md": "한글 블로그 (1,200~1,800단어)",
  "blog-en.md": "English blog post",
  "linkedin-company.md": "LinkedIn 회사 포스트 2개",
  "linkedin-personal.md": "LinkedIn 개인 포스트 2개",
  "x-posts.md": "X 포스트 5개 + 스레드",
  "blog-thumbnail.md": "블로그 썸네일 프롬프트",
  "linkedin-images.md": "LinkedIn 이미지 프롬프트 2개",
  "seo-meta.json": "SEO 메타데이터 & OG tags",
  "utm-links.json": "UTM 트래킹 링크",
  "summary.md": "주간 요약 & 체크리스트",
};

let selected = { topic: "", keywords: "", angle: "" };
let elapsedTimer = null;

export function renderGenerate(container) {
  container.innerHTML = buildTemplate();
  initModal();
  initTopicSelection();
  initNavigation();
  initContentTypeToggles();
  initGenerationFlow();
  loadHistory();

  window.addEventListener("openWeek", (e) => {
    showHistoryFiles(e.detail.folder, e.detail.structure);
  }, { once: true });
}

// ─── Template ──────────────────────────────────────────────
function buildTemplate() {
  const catGroups = { a: [], b: [], c: [], d: [] };
  TOPICS.forEach((t) => catGroups[t.cat].push(t));
  const catMeta = {
    a: { name: "A. S/4HANA Migration", cls: "cat-a" },
    b: { name: "B. Test Automation", cls: "cat-b" },
    c: { name: "C. Competitor Pain Points", cls: "cat-c" },
    d: { name: "D. Trends", cls: "cat-d" },
  };

  const categoriesHtml = Object.entries(catGroups).map(([key, topics]) => `
    <div class="topic-category ${catMeta[key].cls}">
      <h3>${catMeta[key].name}</h3>
      ${topics.map((t) => `
        <button class="topic-btn" data-topic="${t.topic}" data-keywords="${t.keywords}" data-angle="${t.angle}">
          <span class="topic-id">${t.id}</span>${t.topic}
        </button>
      `).join("")}
    </div>
  `).join("");

  return `
    <div class="page-header">
      <h1 class="page-title">콘텐츠 생성</h1>
      <p class="page-subtitle">주제를 선택하고 한 주의 마케팅 콘텐츠를 자동으로 생성합니다</p>
    </div>

    <div class="steps">
      <div class="step-dot active" id="dot1">1</div>
      <div class="step-line"></div>
      <div class="step-dot" id="dot2">2</div>
      <div class="step-line"></div>
      <div class="step-dot" id="dot3">3</div>
    </div>

    <!-- STEP 1: 주제 선택 -->
    <div id="step1">
      <div class="topic-categories">${categoriesHtml}</div>
      <details class="custom-topic-section">
        <summary>직접 주제 입력</summary>
        <input type="text" id="customTopic" placeholder="주제 입력...">
        <input type="text" id="customKeywords" placeholder="SEO 키워드 (쉼표 구분)" style="margin-top:8px">
        <input type="text" id="customAngle" placeholder="PerfecTwin 연결 포인트" style="margin-top:8px">
      </details>
      <div class="btn-row">
        <button class="btn btn-primary" id="toStep2" disabled>다음: 설정 →</button>
      </div>
    </div>

    <!-- STEP 2: 설정 -->
    <div id="step2" class="hidden">
      <div class="form-group">
        <label>선택된 주제</label>
        <input type="text" id="fTopic" readonly>
      </div>
      <div class="form-group">
        <label>SEO 키워드</label>
        <textarea id="fKeywords" rows="3" placeholder="예: SAP S/4HANA migration testing&#10;관련 키워드를 여러 줄로 상세하게 입력할수록 SEO에 최적화된 콘텐츠가 생성됩니다"></textarea>
      </div>
      <div class="form-group">
        <label>PerfecTwin 연결 포인트</label>
        <textarea id="fAngle" rows="4" placeholder="예: Data Extractor로 실 프로덕션 데이터를 추출해서 테스트에 활용.&#10;경쟁사 대비 차별점, 구체적 기능, 고객 가치 등을 상세하게 작성할수록&#10;더 설득력 있는 콘텐츠가 생성됩니다"></textarea>
      </div>
      <div class="form-group">
        <label>추가 인텔 (선택)</label>
        <input type="text" id="fIntel" placeholder="트렌드, 통계, 경쟁사 정보...">
      </div>

      <label style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:8px">콘텐츠 타입</label>
      <div class="type-groups">
        <div class="type-group">
          <div class="type-group-header">
            <span>📄 발행 콘텐츠</span>
            <button class="cat-toggle" data-cat="publish">전체 해제</button>
          </div>
          <div class="toggles">
            <span class="toggle-chip on" data-type="blog-ko" data-cat="publish"><span class="chip-label">Blog KO</span><span class="chip-desc">한글 블로그 (1,200~1,800단어)</span></span>
            <span class="toggle-chip on" data-type="blog-en" data-cat="publish"><span class="chip-label">Blog EN</span><span class="chip-desc">영어 블로그 (로컬라이제이션)</span></span>
            <span class="toggle-chip on" data-type="linkedin-company" data-cat="publish"><span class="chip-label">LinkedIn Company</span><span class="chip-desc">회사 포스트 2개</span></span>
            <span class="toggle-chip on" data-type="linkedin-personal" data-cat="publish"><span class="chip-label">LinkedIn Personal</span><span class="chip-desc">개인 포스트 2개</span></span>
            <span class="toggle-chip on" data-type="x-posts" data-cat="publish"><span class="chip-label">X Posts</span><span class="chip-desc">포스트 5개 + 스레드</span></span>
          </div>
        </div>
        <div class="type-group">
          <div class="type-group-header">
            <span>🖼️ 이미지 프롬프트</span>
            <button class="cat-toggle" data-cat="image">전체 해제</button>
          </div>
          <div class="toggles">
            <span class="toggle-chip on" data-type="img-blog-thumbnail" data-cat="image"><span class="chip-label">블로그 썸네일</span><span class="chip-desc">OG 이미지 Ideogram 프롬프트</span></span>
            <span class="toggle-chip on" data-type="img-linkedin-company" data-cat="image"><span class="chip-label">LinkedIn 이미지</span><span class="chip-desc">회사 포스트 이미지 가이드 2개</span></span>
          </div>
        </div>
        <div class="type-group">
          <div class="type-group-header meta">
            <span>⚙️ 메타데이터</span>
            <span class="meta-badge">항상 자동 생성</span>
          </div>
          <div class="toggles">
            <span class="toggle-chip disabled"><span class="chip-label">SEO Meta</span></span>
            <span class="toggle-chip disabled"><span class="chip-label">UTM Links</span></span>
            <span class="toggle-chip disabled"><span class="chip-label">Summary</span></span>
          </div>
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-secondary" id="backToStep1">← 뒤로</button>
        <button class="btn btn-primary" id="startGenerate">콘텐츠 생성 시작</button>
      </div>
    </div>

    <!-- STEP 3: 생성 -->
    <div id="step3" class="hidden">
      <div class="progress-tracker">
        <div class="progress-header">
          <strong id="genStatus">콘텐츠 생성 중...</strong>
          <span class="elapsed" id="elapsed">0:00</span>
        </div>
        <div class="progress-steps" id="progressSteps">
          <div class="p-step" data-step="1"><div class="p-step-icon">1</div><span>한글 블로그 (blog-ko.md)</span></div>
          <div class="p-step" data-step="2"><div class="p-step-icon">2</div><span>영어 블로그 (blog-en.md)</span></div>
          <div class="p-step" data-step="3"><div class="p-step-icon">3</div><span>소셜 포스트 — LinkedIn + X (병렬)</span></div>
          <div class="p-step" data-step="4"><div class="p-step-icon">4</div><span>이미지 프롬프트 생성</span></div>
          <div class="p-step" data-step="5"><div class="p-step-icon">5</div><span>요약 + 메타데이터</span></div>
        </div>
      </div>
      <div class="log-area" id="logArea" style="display:none"></div>
      <div class="results hidden" id="results">
        <div class="results-title">✓ 콘텐츠 생성 완료!</div>
        <div class="file-list" id="fileList"></div>
      </div>
      <div class="btn-row hidden" id="doneActions">
        <button class="btn btn-secondary" id="newGenerate">새로 생성</button>
      </div>
    </div>

    <!-- 히스토리 -->
    <div class="history">
      <div class="history-title">이전 결과</div>
      <div class="history-weeks" id="historyWeeks"></div>
      <div class="history-files" id="historyFiles">
        <div class="file-list" id="historyFileList"></div>
      </div>
    </div>
  `;
}

// ─── Step 1: 주제 선택 ────────────────────────────────────
function initTopicSelection() {
  document.querySelectorAll(".topic-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".topic-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selected = { topic: btn.dataset.topic, keywords: btn.dataset.keywords, angle: btn.dataset.angle };
      document.getElementById("toStep2").disabled = false;
      document.getElementById("customTopic").value = "";
      document.getElementById("customKeywords").value = "";
      document.getElementById("customAngle").value = "";
    });
  });

  ["customTopic", "customKeywords", "customAngle"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      const t = document.getElementById("customTopic").value.trim();
      const k = document.getElementById("customKeywords").value.trim();
      const a = document.getElementById("customAngle").value.trim();
      if (t && k && a) {
        document.querySelectorAll(".topic-btn").forEach((b) => b.classList.remove("selected"));
        selected = { topic: t, keywords: k, angle: a };
        document.getElementById("toStep2").disabled = false;
      }
    });
  });
}

// ─── Navigation ───────────────────────────────────────────
function initNavigation() {
  document.getElementById("toStep2").addEventListener("click", () => {
    document.getElementById("fTopic").value = selected.topic;
    document.getElementById("fKeywords").value = selected.keywords;
    document.getElementById("fAngle").value = selected.angle;
    document.querySelectorAll(".toggle-chip[data-cat]").forEach((c) => c.classList.add("on"));
    document.querySelectorAll(".cat-toggle").forEach((b) => (b.textContent = "전체 해제"));
    showStep(2);
  });

  document.getElementById("backToStep1").addEventListener("click", () => showStep(1));

  document.getElementById("newGenerate").addEventListener("click", () => {
    showStep(1);
    document.querySelectorAll(".topic-btn").forEach((b) => b.classList.remove("selected"));
    document.getElementById("toStep2").disabled = true;
    document.getElementById("fIntel").value = "";
    if (elapsedTimer) clearInterval(elapsedTimer);
  });
}

function showStep(n) {
  ["step1", "step2", "step3"].forEach((id, i) => {
    document.getElementById(id).classList.toggle("hidden", i + 1 !== n);
  });
  document.getElementById("dot1").className = "step-dot " + (n === 1 ? "active" : "done");
  document.getElementById("dot2").className = "step-dot " + (n === 2 ? "active" : n > 2 ? "done" : "");
  document.getElementById("dot3").className = "step-dot " + (n === 3 ? "active" : "");
}

// ─── Content type toggles ─────────────────────────────────
function initContentTypeToggles() {
  document.querySelectorAll(".toggle-chip[data-cat]").forEach((chip) => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("on");
      const cat = chip.dataset.cat;
      const allOn = [...document.querySelectorAll(`.toggle-chip[data-cat="${cat}"]`)].every((c) => c.classList.contains("on"));
      const btn = document.querySelector(`.cat-toggle[data-cat="${cat}"]`);
      if (btn) btn.textContent = allOn ? "전체 해제" : "전체 선택";
    });
  });

  document.querySelectorAll(".cat-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      const chips = document.querySelectorAll(`.toggle-chip[data-cat="${cat}"]`);
      const allOn = [...chips].every((c) => c.classList.contains("on"));
      chips.forEach((c) => c.classList.toggle("on", !allOn));
      btn.textContent = allOn ? "전체 선택" : "전체 해제";
    });
  });
}

// ─── Generation flow ──────────────────────────────────────
function initGenerationFlow() {
  document.getElementById("startGenerate").addEventListener("click", startGeneration);
}

function updateProgressStep(stepNum, state) {
  document.querySelectorAll("#progressSteps .p-step").forEach((s) => {
    const n = parseInt(s.dataset.step);
    if (n < stepNum && !s.classList.contains("skip")) {
      s.className = "p-step done";
      const el = s.querySelector(".p-step-icon, .p-step-spinner");
      if (el) el.outerHTML = '<div class="p-step-icon">✓</div>';
    } else if (n === stepNum) {
      if (state === "active") {
        s.className = "p-step active";
        const el = s.querySelector(".p-step-icon, .p-step-spinner");
        if (el) el.outerHTML = '<div class="p-step-spinner"></div>';
      } else if (state === "done") {
        s.className = "p-step done";
        const el = s.querySelector(".p-step-icon, .p-step-spinner");
        if (el) el.outerHTML = '<div class="p-step-icon">✓</div>';
      } else if (state === "skip") {
        s.className = "p-step skip";
        const el = s.querySelector(".p-step-icon, .p-step-spinner");
        if (el) el.outerHTML = '<div class="p-step-icon">—</div>';
      }
    }
  });
}

function resetProgressSteps() {
  document.getElementById("progressSteps").innerHTML = `
    <div class="p-step" data-step="1"><div class="p-step-icon">1</div><span>한글 블로그 (blog-ko.md)</span></div>
    <div class="p-step" data-step="2"><div class="p-step-icon">2</div><span>영어 블로그 (blog-en.md)</span></div>
    <div class="p-step" data-step="3"><div class="p-step-icon">3</div><span>소셜 포스트 — LinkedIn + X (병렬)</span></div>
    <div class="p-step" data-step="4"><div class="p-step-icon">4</div><span>이미지 프롬프트 생성</span></div>
    <div class="p-step" data-step="5"><div class="p-step-icon">5</div><span>요약 + 메타데이터</span></div>
  `;
}

function getStepState(stepNum) {
  const el = document.querySelector(`#progressSteps .p-step[data-step="${stepNum}"]`);
  return el ? (el.classList.contains("skip") ? "skip" : el.classList.contains("done") ? "done" : "other") : "other";
}

async function startGeneration() {
  const topic = document.getElementById("fTopic").value;
  const keywords = document.getElementById("fKeywords").value;
  const angle = document.getElementById("fAngle").value;
  const intel = document.getElementById("fIntel").value;
  const contentTypes = [...document.querySelectorAll(".toggle-chip.on[data-type]")].map((c) => c.dataset.type);

  showStep(3);
  const logArea = document.getElementById("logArea");
  const results = document.getElementById("results");
  const genStatus = document.getElementById("genStatus");
  const doneActions = document.getElementById("doneActions");
  const elapsedEl = document.getElementById("elapsed");

  logArea.innerHTML = "";
  logArea.style.display = "block";
  results.classList.add("hidden");
  doneActions.classList.add("hidden");
  genStatus.textContent = "콘텐츠 생성 중...";
  genStatus.style.color = "";
  resetProgressSteps();

  const startTime = Date.now();
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - startTime) / 1000);
    elapsedEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }, 1000);

  try {
    const { jobId } = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, keywords, angle, intel, contentTypes }),
    }).then((r) => r.json());

    const evtSource = new EventSource(`/api/generate/${jobId}/stream`);

    evtSource.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);

        if (evt.type === "log") {
          const d = evt.data;
          if (d.includes("[1/5]")) updateProgressStep(1, d.includes("Skipping") ? "skip" : "active");
          else if (d.includes("[2/5]")) { updateProgressStep(1, "done"); updateProgressStep(2, d.includes("Skipping") ? "skip" : "active"); }
          else if (d.includes("[3/5]")) { updateProgressStep(2, getStepState(2) === "skip" ? "skip" : "done"); updateProgressStep(3, d.includes("Skipping") ? "skip" : "active"); }
          else if (d.includes("[4/5]")) { updateProgressStep(3, getStepState(3) === "skip" ? "skip" : "done"); updateProgressStep(4, d.includes("Skipping") ? "skip" : "active"); }
          else if (d.includes("[5/5]")) { updateProgressStep(4, getStepState(4) === "skip" ? "skip" : "done"); updateProgressStep(5, "active"); }

          const div = document.createElement("div");
          div.className = (d.startsWith("[") || d.startsWith("===")) ? "status-line" : "log-line";
          div.textContent = d;
          logArea.appendChild(div);
          logArea.scrollTop = logArea.scrollHeight;

        } else if (evt.type === "error") {
          const div = document.createElement("div");
          div.className = "error-line";
          div.textContent = evt.data;
          logArea.appendChild(div);

        } else if (evt.type === "done") {
          clearInterval(elapsedTimer);
          evtSource.close();
          updateProgressStep(5, "done");
          genStatus.innerHTML = "✓ 콘텐츠 생성 완료!";
          genStatus.style.color = "var(--success)";
          logArea.style.display = "none";
          showResultFiles(evt.data.folder, evt.data.structure);
          results.classList.remove("hidden");
          doneActions.classList.remove("hidden");
          loadHistory();
          refreshSidebarWeeks();
        }
      } catch { /* ignore parse errors */ }
    };

    evtSource.onerror = () => {
      clearInterval(elapsedTimer);
      evtSource.close();
      genStatus.textContent = "연결 오류 — 로그를 확인하세요";
      genStatus.style.color = "var(--error)";
    };

  } catch (err) {
    clearInterval(elapsedTimer);
    genStatus.textContent = "오류: " + err.message;
    genStatus.style.color = "var(--error)";
  }
}

// ─── Results ──────────────────────────────────────────────
function showResultFiles(folder, structure) {
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";
  const files = structure.content || [];
  files.forEach((file) => {
    fileList.appendChild(makeFileCard(folder, `content/${file}`, file));
  });
}

function makeFileCard(folder, filePath, fileName) {
  const card = document.createElement("div");
  card.className = "file-card";
  card.innerHTML = `<div class="file-name">${fileName}</div><div class="file-desc">${FILE_DESC[fileName] || ""}</div>`;
  card.addEventListener("click", () => openModal(folder, filePath, fileName));
  return card;
}

// ─── History ──────────────────────────────────────────────
async function loadHistory() {
  try {
    const data = await fetch("/api/outputs").then((r) => r.json());
    const weeksEl = document.getElementById("historyWeeks");
    const filesArea = document.getElementById("historyFiles");
    if (!weeksEl) return;
    weeksEl.innerHTML = "";
    filesArea.classList.remove("show");

    if (!data.length) {
      weeksEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px">아직 결과가 없습니다</p>';
      return;
    }

    data.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "history-week-btn";
      btn.textContent = item.folder;
      btn.addEventListener("click", () => {
        document.querySelectorAll(".history-week-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        showHistoryFiles(item.folder, item.structure);
        filesArea.classList.add("show");
      });
      weeksEl.appendChild(btn);
    });
  } catch { /* ignore */ }
}

function showHistoryFiles(folder, structure) {
  const fileList = document.getElementById("historyFileList");
  if (!fileList) return;
  fileList.innerHTML = "";
  const files = structure.content || [];
  files.forEach((file) => {
    fileList.appendChild(makeFileCard(folder, `content/${file}`, file));
  });
  document.getElementById("historyFiles")?.classList.add("show");
}
