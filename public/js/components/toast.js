let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = "default", duration = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast${type !== "default" ? " " + type : ""}`;
  const icons = { success: "✓", error: "✕", warning: "⚠", default: "ℹ" };
  toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${message}</span>`;
  getContainer().appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity .2s";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
