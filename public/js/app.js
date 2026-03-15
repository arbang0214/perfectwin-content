import { initSidebar } from "./components/sidebar.js";
import { renderGenerate } from "./pages/generate.js";
import { renderDashboard } from "./pages/dashboard.js";
import { renderTopics } from "./pages/topics.js";

function navigate(hash) {
  const h = hash || "#generate";
  const container = document.getElementById("mainContent");
  if (!container) return;
  container.innerHTML = "";

  // Split base route from sub-route: "#dashboard/new" → base="#dashboard", sub="new"
  const slashIdx = h.indexOf("/");
  const base = slashIdx === -1 ? h : h.slice(0, slashIdx);
  const subroute = slashIdx === -1 ? "" : h.slice(slashIdx + 1);

  if (base === "#dashboard") {
    renderDashboard(container, subroute);
  } else if (base === "#topics") {
    renderTopics(container);
  } else {
    renderGenerate(container);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  navigate(location.hash || "#generate");
});

window.addEventListener("hashchange", () => navigate(location.hash));
