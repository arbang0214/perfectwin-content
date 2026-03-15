export function initSidebar() {
  updateActiveNav();
  loadRecentWeeks();
  window.addEventListener("hashchange", updateActiveNav);
}

function updateActiveNav() {
  const hash = location.hash || "#generate";
  document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === hash);
  });
}

async function loadRecentWeeks() {
  const container = document.getElementById("sidebarRecentWeeks");
  if (!container) return;
  try {
    const res = await fetch("/api/outputs");
    const data = await res.json();
    container.innerHTML = "";
    if (!data.length) {
      container.innerHTML = '<span style="padding:0 10px;font-size:12px;color:var(--text-muted)">아직 없음</span>';
      return;
    }
    data.slice(0, 5).forEach((item) => {
      const el = document.createElement("a");
      el.className = "recent-week-item";
      el.textContent = item.folder.replace("week-", "");
      el.title = item.folder;
      el.addEventListener("click", () => {
        location.hash = "#generate";
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("openWeek", { detail: item }));
        }, 100);
      });
      container.appendChild(el);
    });
  } catch {
    // ignore
  }
}

export function refreshSidebarWeeks() {
  loadRecentWeeks();
}
