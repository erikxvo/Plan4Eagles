/* ============================================
   SHARED UI HELPERS - Plan4Eagles
   Toast notifications used across pages.
   Loaded before each page script.
   ============================================ */

/**
 * Shows a transient toast message.
 * type: "info" (default) | "success" | "error"
 */
function showToast(message, options = {}) {
  const { type = "info", duration = 4500 } = options;

  let region = document.getElementById("toast-region");
  if (!region) {
    region = document.createElement("div");
    region.id = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  region.appendChild(toast);

  // Limit how many toasts stack up
  while (region.children.length > 3) {
    region.removeChild(region.firstChild);
  }

  const remove = () => {
    toast.classList.add("toast-leaving");
    setTimeout(() => toast.remove(), 250);
  };
  const timer = setTimeout(remove, duration);
  toast.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}
