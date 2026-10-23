import { CONFIG } from "./config.js";
import { auth, db, fb, authReady } from "./firebase.js";
import { encodeEmail } from "./crypto.js";
const $ = s => document.querySelector(s);
function allowed(email) {
  const suffix = String(CONFIG.ALLOWED_EMAIL_SUFFIX || "").trim().toLowerCase();
  return !suffix || email.trim().toLowerCase().endsWith(suffix);
}
function messageFor(error) {
  const code = error?.code || "";
  return ({
    "auth/invalid-credential":"Email or password is incorrect.",
    "auth/user-not-found":"No account was found for this email.",
    "auth/wrong-password":"Email or password is incorrect.",
    "auth/weak-password":"Use a stronger password (at least 6 characters).",
    "auth/email-already-in-use":"An account already exists for this email. Try signing in.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/too-many-requests":"Too many attempts. Please try again later.",
    "auth/network-request-failed":"Network error. Check your connection and try again.",
    "PERMISSION_DENIED":"Firebase rules blocked this action. Publish the updated database.rules.json rules in Realtime Database → Rules.",
    "database/permission-denied":"Firebase rules blocked this action. Publish the updated database.rules.json rules in Realtime Database → Rules."
  })[code] || error?.message || "We couldn't complete that request. Please try again.";
}
export function openAuth() {
  const host = $("#chatView");
  const appShell = $("#app"), premium = $("#premiumView");
  if (appShell) appShell.hidden = true;
  if (premium) premium.hidden = true;
  host.hidden = false;
  document.title = "Sign in — Velora Messages";
  host.innerHTML = `<div class="auth-wrap"><form class="auth-card" id="authForm"><div class="auth-mark">V</div><p class="chat-kicker">VELORA · PRIVATE MESSAGES</p><h1>Your space awaits.</h1><p>Sign in or create an account to connect with people.</p><div class="auth-tabs"><button type="button" class="active" data-authmode="signin">Sign in</button><button type="button" data-authmode="signup">Create account</button></div><label for="authEmail">Gmail address</label><input id="authEmail" type="email" autocomplete="username" placeholder="you@gmail.com" required><label for="authPassword">Password</label><div class="password-row"><input id="authPassword" type="password" autocomplete="current-password" minlength="6" required><button type="button" id="togglePassword">Show</button></div><div class="auth-error" id="authError" role="alert"></div><button class="chat-primary" type="submit" id="authSubmit">Sign in</button><p class="auth-footnote">Your account stays signed in on this device until you sign out.</p><button type="button" id="authBack" class="chat-secondary">Back to store</button></form></div>`;
  let mode = "signin";
  host.querySelectorAll("[data-authmode]").forEach(b => b.onclick = () => {
    mode = b.dataset.authmode;
    host.querySelectorAll("[data-authmode]").forEach(x => x.classList.toggle("active", x === b));
    $("#authSubmit").textContent = mode === "signin" ? "Sign in" : "Create account";
    $("#authPassword").autocomplete = mode === "signin" ? "current-password" : "new-password";
    $("#authError").textContent = "";
  });
  $("#togglePassword").onclick = () => { const x = $("#authPassword"); x.type = x.type === "password" ? "text" : "password"; $("#togglePassword").textContent = x.type === "password" ? "Show" : "Hide"; };
  $("#authBack").onclick = () => import("./secret.js").then(m => m.backToStore());
  $("#authForm").onsubmit = async e => {
    e.preventDefault();
    const email = $("#authEmail").value.trim().toLowerCase(), password = $("#authPassword").value, error = $("#authError"), submit = $("#authSubmit");
    if (!allowed(email)) { error.textContent = CONFIG.ALLOWED_EMAIL_SUFFIX ? `Use an email ending in ${CONFIG.ALLOWED_EMAIL_SUFFIX.replace(/^@/, "@").replace(/@/, "")}.` : "Enter a valid email address."; return; }
    submit.disabled = true; submit.textContent = mode === "signin" ? "Signing in…" : "Creating account…"; error.textContent = "";
    try {
      await authReady;
      const credential = mode === "signup" ? await fb.createUserWithEmailAndPassword(auth, email, password) : await fb.signInWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      try { sessionStorage.setItem("velora-chat-active", "1"); } catch {}
      // Best-effort searchable email index; the profile flow will surface permission failures where relevant.
      try { await fb.set(fb.ref(db, `emailIndex/${encodeEmail(email)}`), user.uid); } catch (indexError) { console.warn("Email search index could not be written:", indexError); }
      const snap = await fb.get(fb.ref(db, `users/${user.uid}/username`));
      if (!snap.exists()) { const { openProfile } = await import("./profile.js"); openProfile(user); }
      else { const { openChat } = await import("./chat.js"); openChat(user); }
    } catch (err) { error.textContent = messageFor(err); }
    finally { submit.disabled = false; submit.textContent = mode === "signin" ? "Sign in" : "Create account"; }
  };
}
