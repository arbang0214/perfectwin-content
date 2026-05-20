/**
 * PerfecTwin 누적 대시보드 — 클라이언트 사이드 차트 초기화
 *
 * data.json (build-dashboard.js가 생성)을 fetch해서 KPI 카드 + Chart.js
 * 4개 차트를 렌더링한다.
 */

const COLORS = {
  blue: "#2563eb",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  slate: "#64748b",
  pink: "#ec4899",
  cyan: "#06b6d4",
};

function fmtInt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("ko-KR");
}

function fmtFloat(n, digits = 1) {
  if (n == null) return "—";
  return Number(n).toLocaleString("ko-KR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function loadData() {
  // 캐시 우회: 같은 날 여러 번 빌드돼도 최신 fetch
  const res = await fetch(`data.json?t=${Date.now()}`);
  if (!res.ok) throw new Error(`data.json fetch failed: ${res.status}`);
  return res.json();
}

function renderHeader(data) {
  setText(
    "dateRange",
    `${data.range.from} ~ ${data.range.to} (${data.range.days}일 누적)`,
  );
  const ts = new Date(data.generatedAt);
  setText(
    "lastUpdated",
    `업데이트: ${ts.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  );
}

function renderKPI(data) {
  setText("kpiSubmissions", fmtInt(data.kpi.totalSubmissions));
  setText("kpiHomeTraffic", fmtFloat(data.kpi.avgRecentHomeTraffic));
  setText("kpiBlogTraffic", fmtFloat(data.kpi.avgRecentBlogTraffic));
  setText("kpiPosts", fmtInt(data.kpi.trackedPosts));
}

function renderDemoChart(series) {
  const ctx = document.getElementById("demoChart");
  new Chart(ctx, {
    data: {
      labels: series.map((d) => d.date),
      datasets: [
        {
          type: "bar",
          label: "일별 신청",
          data: series.map((d) => d.daily),
          backgroundColor: COLORS.blue,
          yAxisID: "y",
          order: 2,
        },
        {
          type: "line",
          label: "누적 신청",
          data: series.map((d) => d.cumulative),
          borderColor: COLORS.green,
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 2,
          yAxisID: "y1",
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "일별" }, ticks: { precision: 0 } },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "누적" },
          ticks: { precision: 0 },
        },
      },
    },
  });
}

function renderTrafficChart(series) {
  const ctx = document.getElementById("trafficChart");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: series.map((d) => d.date),
      datasets: [
        {
          label: "홈페이지 (GA4)",
          data: series.map((d) => d.home),
          borderColor: COLORS.blue,
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 1,
        },
        {
          label: "영문 블로그",
          data: series.map((d) => d.blogEn),
          borderColor: COLORS.green,
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 1,
        },
        {
          label: "한글 블로그",
          data: series.map((d) => d.blogKo),
          borderColor: COLORS.amber,
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

function renderGscChart(series) {
  const ctx = document.getElementById("gscChart");
  new Chart(ctx, {
    data: {
      labels: series.map((d) => d.date),
      datasets: [
        {
          type: "bar",
          label: "노출",
          data: series.map((d) => d.impressions),
          backgroundColor: "rgba(37, 99, 235, 0.3)",
          yAxisID: "y",
          order: 3,
        },
        {
          type: "line",
          label: "클릭",
          data: series.map((d) => d.clicks),
          borderColor: COLORS.green,
          backgroundColor: "transparent",
          tension: 0.25,
          pointRadius: 2,
          yAxisID: "y",
          order: 2,
        },
        {
          type: "line",
          label: "평균 순위",
          data: series.map((d) => d.avgPosition),
          borderColor: COLORS.red,
          backgroundColor: "transparent",
          borderDash: [4, 4],
          tension: 0.25,
          pointRadius: 2,
          yAxisID: "y1",
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: "클릭/노출" }, ticks: { precision: 0 } },
        y1: {
          reverse: true,
          position: "right",
          grid: { drawOnChartArea: false },
          title: { display: true, text: "평균 순위 (낮을수록 좋음)" },
        },
      },
    },
  });
}

function renderPostsChart(posts) {
  const ctx = document.getElementById("postsChart");
  // 긴 제목 줄임 처리
  const labels = posts.map((p) => {
    const t = p.title || p.slug || "(제목 없음)";
    return t.length > 60 ? t.slice(0, 57) + "…" : t;
  });
  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "누적 visits",
          data: posts.map((p) => p.visits),
          backgroundColor: posts.map((p) => (p.blog === "blog-ko" ? COLORS.amber : COLORS.blue)),
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const p = posts[items[0].dataIndex];
              return [`Blog: ${p.blog}`, `Slug: ${p.slug || "—"}`, `CTA 클릭: ${p.clicks}`, `Organic: ${p.organic}`];
            },
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

(async function init() {
  try {
    const data = await loadData();
    renderHeader(data);
    renderKPI(data);
    renderDemoChart(data.charts.demo);
    renderTrafficChart(data.charts.traffic);
    renderGscChart(data.charts.gsc);
    renderPostsChart(data.charts.topPosts);
  } catch (err) {
    console.error(err);
    const main = document.querySelector(".container");
    if (main) {
      main.innerHTML = `<div class="kpi-card" style="color:#ef4444">데이터 로드 실패: ${err.message}</div>`;
    }
  }
})();
