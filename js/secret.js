import { CONFIG } from "./config.js";
export function backToStore() {
  const chat = document.getElementById("chatView");
  if (chat) { chat.innerHTML = ""; chat.hidden = true; }
  const premium = document.getElementById("premiumView"); if (premium) premium.hidden = true;
  const app = document.getElementById("app"); if (app) app.hidden = false;
  document.title = "Velora — The Art of Dressing";
  document.body.dataset.route = "home";
  try { sessionStorage.removeItem("velora-chat-active"); } catch {}
  window.dispatchEvent(new Event("velora:show-store"));
}
export function installDisguiseControls() {
  // Do not auto-close on focus/visibility changes: those events fire during normal mobile/browser use.
  // The user can still deliberately return using the in-app store button or Escape.
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && document.getElementById("chatView")?.hidden === false) backToStore();
  });
}
export { CONFIG };
installDisguiseControls();
