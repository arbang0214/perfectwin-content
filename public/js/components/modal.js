let currentRaw = "";

function renderMarkdown(md) {
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => `<pre><code>${code.trim()}</code></pre>`)
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^---+$/gm, "<hr>")
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- \[ \] (.+)$/gm, '<li style="list-style:none"><input type="checkbox" disabled> $1</li>')
    .replace(/^- \[x\] (.+)$/gm, '<li style="list-style:none"><input type="checkbox" checked disabled> $1</li>')
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#3B82F6">$1</a>')
    .replace(/^(?!<[hluopba]|<\/|<hr|<li|<pre|<block)(.+)$/gm, "<p>$1</p>");
  html = html.replace(/((?:<li[^>]*>.*<\/li>\s*)+)/g, '<ul style="list-style:none;padding-left:8px">$1</ul>');
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, "<br>");
  return html;
}

export function initModal() {
  const overlay = document.getElementById("modal");
  const closeBtn = document.getElementById("modalClose");
  if (!overlay || !closeBtn) return;

  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

  document.querySelectorAll(".modal-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const body = document.getElementById("modalBody");
      document.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      if (tab.dataset.tab === "raw" && currentRaw) {
        body.classList.add("raw");
        body.textContent = currentRaw;
      } else if (tab.dataset.tab === "preview" && currentRaw) {
        body.classList.remove("raw");
        body.innerHTML = renderMarkdown(currentRaw);
      }
    });
  });
}

export function openModal(folder, filePath, displayName) {
  const overlay = document.getElementById("modal");
  const title = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");
  const tabs = document.getElementById("modalTabs");

  title.textContent = `${folder} / ${filePath}`;
  body.innerHTML = '<p style="color:#94A3B8">Loading...</p>';
  body.classList.remove("raw");
  overlay.classList.add("show");

  const name = displayName || filePath;
  const isMd = name.endsWith(".md");
  tabs.style.display = isMd ? "flex" : "none";
  document.querySelectorAll(".modal-tab").forEach((t) => t.classList.remove("active"));
  const previewTab = document.querySelector('.modal-tab[data-tab="preview"]');
  if (previewTab) previewTab.classList.add("active");

  fetch(`/api/output/${folder}/${filePath}`)
    .then((r) => (name.endsWith(".json") ? r.json() : r.text()))
    .then((data) => {
      if (typeof data === "object") {
        body.classList.add("raw");
        body.textContent = JSON.stringify(data, null, 2);
        currentRaw = "";
      } else if (isMd) {
        currentRaw = data;
        body.innerHTML = renderMarkdown(data);
      } else {
        body.classList.add("raw");
        body.textContent = data;
        currentRaw = "";
      }
    })
    .catch((err) => { body.textContent = "Error loading file: " + err.message; });
}

export function closeModal() {
  document.getElementById("modal")?.classList.remove("show");
}
