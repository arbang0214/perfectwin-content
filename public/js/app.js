import { initSidebar } from "./components/sidebar.js";
import { renderGenerate } from "./pages/generate.js";
import { renderDashboard } from "./pages/dashboard.js";
import { renderTopics } from "./pages/topics.js";

const routes = {
  "#generate": renderGenerate,
  "#dashboard": renderDashboard,
  "#topics": renderTopics,
};

function navigate(hash) {
  const h = hash || "#generate";
  const render = routes[h] || renderGenerate;
  const container = document.getElementById("mainContent");
  if (container) {
    container.innerHTML = "";
    render(container);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  navigate(location.hash || "#generate");
});

window.addEventListener("hashchange", () => navigate(location.hash));
