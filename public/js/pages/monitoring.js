import { showToast } from "../components/toast.js";

let currentTab = "insights"; // "insights" or "raw"

export function renderMonitoring(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">성과 모니터링</h1>
      <p class="page-subtitle">GA4 · GSC · inblog 일간 성과 데이터 + AI 인사이트</p>
    </div>

    <div class="mon-toolbar">
      <div class="mon-actions">
        <button class="btn btn-primary" id="monCollectBtn">📡 지금 수집</button>
        <select class="mon-date-select" id="monDateSelect">
          <option value="">날짜 선택...</option>
        </select>
      </div>
    </div>

    <div class="mon-tabs" id="monTabs">
      <button class="mon-tab active" data-tab="insights">📊 인사이트 리포트</button>
      <button class="mon-tab" data-tab="raw">🔢 원시 데이터</button>
    </div>

    <div id="monReport" class="mon-report">
      <div class="mon-empty">날짜를 선택하거나 "지금 수집" 버튼을 눌러주세요</div>
    </div>
  `;

  loadDates();
  document.getElementById("monDateSelect").addEventListener("change", onDateChange);
  document.getElementById("monCollectBtn").addEventListener("click", onCollect);
  document.getElementById("monTabs").addEventListener("click", (e) => {
    const tab = e.target.dataset?.tab;
    if (!tab) return;
    currentTab = tab;
    document.querySelectorAll(".mon-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    const date = document.getElementById("monDateSelect").value;
    if (date) loadForDate(date);
  });
}

async function loadDates() {
  try {
    const res = await fetch("/api/monitoring/reports");
    const dates = await res.json();
    const select = document.getElementById("monDateSelect");
    dates.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      select.appendChild(opt);
    });
    if (dates.length > 0) {
      select.value = dates[0];
      loadForDate(dates[0]);
    }
  } catch {
    // ignore
  }
}

function onDateChange(e) {
  if (e.target.value) loadForDate(e.target.value);
}

function loadForDate(date) {
  if (currentTab === "insights") {
    loadInsightReports(date);
  } else {
    loadRawReport(date);
  }
}

async function onCollect() {
  const btn = document.getElementById("monCollectBtn");
  btn.disabled = true;
  btn.textContent = "⏳ 수집 + 리포트 생성 중...";

  try {
    const res = await fetch("/api/monitoring/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = await res.json();
    if (result.success) {
      showToast("데이터 수집 + 리포트 생성 완료!", "success");
      const datesRes = await fetch("/api/monitoring/reports");
      const dates = await datesRes.json();
      const select = document.getElementById("monDateSelect");
      select.innerHTML = '<option value="">날짜 선택...</option>';
      dates.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
      });
      if (dates.length > 0) {
        select.value = dates[0];
        loadForDate(dates[0]);
      }
    } else {
      showToast("수집 실패 — 콘솔 로그 확인", "error");
    }
  } catch (err) {
    showToast(`오류: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "📡 지금 수집";
  }
}

// ─── 인사이트 리포트 탭 ─────────────────────────────────

async function loadInsightReports(date) {
  const container = document.getElementById("monReport");
  container.innerHTML = '<div class="mon-loading">리포트 로딩 중...</div>';

  try {
    const listRes = await fetch("/api/monitoring/insight-reports");
    const allReports = await listRes.json();
    const dayReports = allReports.filter((r) => r.date === date);

    if (dayReports.length === 0) {
      container.innerHTML = `<div class="mon-empty">
        ${date}의 인사이트 리포트가 없습니다.<br>
        <span style="font-size:13px;color:var(--text-muted)">"지금 수집" 버튼으로 데이터 수집 + 리포트를 생성하세요</span>
      </div>`;
      return;
    }

    let html = "";
    for (const report of dayReports) {
      const res = await fetch(`/api/monitoring/insight-report/${report.file}`);
      const { content } = await res.json();
      const label = report.type === "homepage" ? "🏠 홈페이지" : "📝 블로그";
      html += `
        <div class="mon-section mon-insight-section">
          <div class="mon-insight-header">
            <span class="mon-insight-badge">${label}</span>
          </div>
          <div class="mon-insight-body">${renderMarkdown(content)}</div>
        </div>
      `;
    }
    container.innerHTML = html;
  } catch {
    container.innerHTML = '<div class="mon-empty">리포트를 불러올 수 없습니다</div>';
  }
}

// ─── 원시 데이터 탭 ─────────────────────────────────────

async function loadRawReport(date) {
  const container = document.getElementById("monReport");
  container.innerHTML = '<div class="mon-loading">로딩 중...</div>';

  try {
    const res = await fetch(`/api/monitoring/report/${date}`);
    if (!res.ok) throw new Error("데이터 없음");
    const data = await res.json();
    container.innerHTML = renderRawReport(data);
  } catch {
    container.innerHTML = '<div class="mon-empty">해당 날짜 데이터를 불러올 수 없습니다</div>';
  }
}

function renderRawReport(data) {
  const ga4 = data.ga4;
  const gsc = data.gsc;
  const inblog = data.inblog;

  let html = `<div class="mon-date-header">${data.date} 원시 데이터 <span class="mon-collected">수집: ${new Date(data.collectedAt).toLocaleString("ko-KR")}</span></div>`;

  // GA4
  html += '<div class="mon-section">';
  html += '<h3 class="mon-section-title">📊 GA4 — 웹사이트 트래픽</h3>';
  if (ga4) {
    const s = ga4.summary;
    html += `
      <div class="mon-metrics">
        <div class="mon-metric-card"><div class="mon-metric-label">방문자</div><div class="mon-metric-value">${s.activeUsers}</div></div>
        <div class="mon-metric-card"><div class="mon-metric-label">세션</div><div class="mon-metric-value">${s.sessions}</div></div>
        <div class="mon-metric-card"><div class="mon-metric-label">페이지뷰</div><div class="mon-metric-value">${s.pageViews}</div></div>
        <div class="mon-metric-card"><div class="mon-metric-label">참여율</div><div class="mon-metric-value">${s.engagementRate}%</div></div>
        <div class="mon-metric-card"><div class="mon-metric-label">이탈률</div><div class="mon-metric-value">${s.bounceRate}%</div></div>
        <div class="mon-metric-card"><div class="mon-metric-label">체류시간</div><div class="mon-metric-value">${Math.floor(s.avgSessionDuration/60)}분${Math.round(s.avgSessionDuration%60)}초</div></div>
      </div>`;
    if (ga4.topPages?.length) {
      html += '<div class="mon-table-wrap"><h4>Top 페이지</h4><table class="mon-table"><thead><tr><th>페이지</th><th>조회수</th><th>사용자</th><th>체류</th><th>이탈률</th></tr></thead><tbody>';
      ga4.topPages.forEach((p) => {
        html += `<tr><td class="mon-page-path">${esc(p.pagePath)}</td><td>${p.pageViews}</td><td>${p.users}</td><td>${Math.round(p.avgDuration)}초</td><td>${p.bounceRate}%</td></tr>`;
      });
      html += '</tbody></table></div>';
    }
    if (ga4.channels?.length) {
      html += '<div class="mon-table-wrap"><h4>유입 경로</h4><table class="mon-table"><thead><tr><th>채널</th><th>세션</th><th>사용자</th><th>참여율</th></tr></thead><tbody>';
      ga4.channels.forEach((c) => { html += `<tr><td>${esc(c.channel)}</td><td>${c.sessions}</td><td>${c.users}</td><td>${c.engagementRate}%</td></tr>`; });
      html += '</tbody></table></div>';
    }
  } else { html += '<div class="mon-no-data">GA4 데이터 없음</div>'; }
  html += '</div>';

  // GSC
  if (gsc?.sites?.length) {
    for (const site of gsc.sites) {
      html += '<div class="mon-section">';
      const icon = site.label.includes("blog") ? "📝" : "🔍";
      const siteLabel = site.label.includes("blog") ? "블로그 검색" : "웹사이트 검색";
      const dateNote = site.actualDate && site.actualDate !== site.date ? ` <span class="mon-note">(실제: ${site.actualDate})</span>` : "";
      html += `<h3 class="mon-section-title">${icon} GSC — ${siteLabel} <span style="font-weight:400;font-size:12px;color:var(--text-muted)">${esc(site.label)}</span>${dateNote}</h3>`;
      if (site.totals) {
        const t = site.totals;
        html += `<div class="mon-metrics">
          <div class="mon-metric-card"><div class="mon-metric-label">클릭</div><div class="mon-metric-value">${t.clicks}</div></div>
          <div class="mon-metric-card"><div class="mon-metric-label">노출</div><div class="mon-metric-value">${t.impressions}</div></div>
          <div class="mon-metric-card"><div class="mon-metric-label">CTR</div><div class="mon-metric-value">${t.ctr}%</div></div>
          <div class="mon-metric-card"><div class="mon-metric-label">순위</div><div class="mon-metric-value">${t.position}</div></div>
        </div>`;
        if (site.topQueries?.length) {
          html += '<div class="mon-table-wrap"><h4>Top 검색어</h4><table class="mon-table"><thead><tr><th>검색어</th><th>클릭</th><th>노출</th><th>순위</th></tr></thead><tbody>';
          site.topQueries.forEach((q) => { html += `<tr><td>${esc(q.query)}</td><td>${q.clicks}</td><td>${q.impressions}</td><td>${q.position}</td></tr>`; });
          html += '</tbody></table></div>';
        }
      } else { html += '<div class="mon-no-data">데이터 없음</div>'; }
      html += '</div>';
    }
  }

  // inblog
  if (inblog?.blogs?.length) {
    for (const blog of inblog.blogs) {
      html += '<div class="mon-section">';
      const label = blog.label === "blog-en" ? "영문 블로그" : "한글 블로그";
      html += `<h3 class="mon-section-title">📰 inblog — ${label}</h3>`;
      const t = blog.traffic?.data?.[0];
      if (t) {
        html += `<div class="mon-metrics">
          <div class="mon-metric-card"><div class="mon-metric-label">방문</div><div class="mon-metric-value">${t.visits}</div></div>
          <div class="mon-metric-card"><div class="mon-metric-label">클릭</div><div class="mon-metric-value">${t.clicks}</div></div>
          <div class="mon-metric-card"><div class="mon-metric-label">오가닉</div><div class="mon-metric-value">${t.organic}</div></div>
          <div class="mon-metric-card"><div class="mon-metric-label">포스트뷰</div><div class="mon-metric-value">${t.post}</div></div>
        </div>`;
      }
      if (blog.sources?.data?.length) {
        html += '<div class="mon-table-wrap"><h4>유입 소스</h4><table class="mon-table"><thead><tr><th>소스</th><th>방문</th></tr></thead><tbody>';
        blog.sources.data.forEach((s) => { html += `<tr><td>${esc(s.full_referrer)}</td><td>${s.count}</td></tr>`; });
        html += '</tbody></table></div>';
      }
      html += '</div>';
    }
  }

  return html;
}

// ─── 마크다운 렌더링 (간이) ──────────────────────────────

function renderMarkdown(md) {
  let html = esc(md);
  // 헤더
  html = html.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');
  // 볼드
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // 테이블
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split("|").filter(Boolean).map((c) => c.trim());
    return "<tr>" + cells.map((c) => {
      if (/^[-:]+$/.test(c)) return null;
      return `<td>${c}</td>`;
    }).filter(Boolean).join("") + "</tr>";
  });
  html = html.replace(/(<tr>.*?<\/tr>\n?)+/g, (block) => {
    // 구분자 행 제거
    const rows = block.split("\n").filter((r) => r.trim() && !r.includes("---"));
    if (rows.length === 0) return "";
    const first = rows[0].replace(/<td>/g, "<th>").replace(/<\/td>/g, "</th>");
    const rest = rows.slice(1).join("\n");
    return `<table class="mon-table md-table"><thead>${first}</thead><tbody>${rest}</tbody></table>`;
  });
  // 리스트
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);
  // 줄바꿈
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  return `<p>${html}</p>`;
}

function esc(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}
