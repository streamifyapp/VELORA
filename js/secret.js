// Explicit navigation only. Do not auto-dismiss the private area on blur or tab changes:
// mobile keyboards, password managers and normal app switching can trigger those events.
export function backToStore(){
  const chat=document.getElementById("chatView");
  if(chat){chat.innerHTML="";chat.hidden=true;}
  const premium=document.getElementById("premiumView");
  if(premium){premium.innerHTML="";premium.hidden=true;}
  document.body.classList.remove("chat-on");const app=document.getElementById("app");
  if(app)app.hidden=false;
  document.title="Velora — The Art of Dressing";
  document.body.dataset.route="home";
  window.dispatchEvent(new Event("velora:show-store"));
}
export function installDisguiseControls(){ /* Intentionally no global gesture/blur/visibility handlers. */ }
