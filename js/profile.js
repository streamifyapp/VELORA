import { db, fb } from "./firebase.js";
import { validUsername, safeText } from "./crypto.js";
export function openProfile(user) {
  const host = document.getElementById("chatView"); host.hidden = false;
  document.body.dataset.route = "chat";
  try { sessionStorage.setItem("velora-chat-active", "1"); } catch {}
  host.innerHTML = `<div class="username-wrap"><form class="username-card" id="profileForm"><div class="auth-mark">V</div><p class="chat-kicker">SET UP YOUR PROFILE</p><h1>Choose your handle.</h1><p>People can find you using your unique username or email.</p><label for="usernameInput">Username</label><input id="usernameInput" maxlength="20" autocomplete="off" placeholder="e.g. velvet.rose" required><div id="usernameCheck" class="auth-error">3–20 characters; begin with a letter.</div><label for="displayName">Display name</label><input id="displayName" maxlength="40" placeholder="How friends see you" required><label for="avatarColor">Avatar accent</label><input id="avatarColor" type="color" value="#8b7cff" style="height:45px;padding:4px"><button class="chat-primary" type="submit" id="profileSubmit">Save profile & continue</button><button class="chat-secondary" id="profileBack" type="button">Back to store</button></form></div>`;
  const input = host.querySelector("#usernameInput"), check = host.querySelector("#usernameCheck"); let available = false, timer;
  input.addEventListener("input", () => {
    const name = input.value.trim().toLowerCase(); available = false; clearTimeout(timer);
    if (!validUsername(name)) { check.textContent = "Use 3–20 letters, numbers, dots or underscores; start with a letter."; return; }
    check.textContent = "Checking availability…";
    timer = setTimeout(async () => { try { const snap = await fb.get(fb.ref(db, `usernames/${name}`)); available = !snap.exists() || snap.val() === user.uid; check.textContent = available ? "Username available" : "That username is taken"; check.classList.toggle("success", available); } catch { check.textContent = "Could not check. Publish the updated Firebase rules."; } }, 250);
  });
  host.querySelector("#profileBack").onclick = () => import("./secret.js").then(m => m.backToStore());
  host.querySelector("#profileForm").onsubmit = async e => {
    e.preventDefault(); const name = input.value.trim().toLowerCase(), displayName = host.querySelector("#displayName").value.trim(), avatarColor = host.querySelector("#avatarColor").value, submit = host.querySelector("#profileSubmit");
    if (!validUsername(name)) { check.textContent = "Please choose a valid username."; return; }
    submit.disabled = true; check.textContent = "Saving profile…";
    try {
      const result = await fb.runTransaction(fb.ref(db, `usernames/${name}`), current => current === null || current === user.uid ? user.uid : undefined);
      if (!result.committed) { check.textContent = "That username is taken. Choose another."; return; }
      const privateProfile = { username: name, displayName, avatarColor, email: user.email || "", createdAt: fb.serverTimestamp() };
      await fb.update(fb.ref(db, `users/${user.uid}`), privateProfile);
      await fb.set(fb.ref(db, `publicProfiles/${user.uid}`), { username: name, displayName, avatarColor });
      if (user.email) await fb.set(fb.ref(db, `emailIndex/${user.email.trim().toLowerCase().replace(/\./g, ",")}`), user.uid);
      const { openChat } = await import("./chat.js"); await openChat(user);
    } catch (err) { console.error(err); check.textContent = err?.code === "PERMISSION_DENIED" || String(err?.message || "").includes("PERMISSION_DENIED") ? "Firebase blocked profile saving. Publish the updated database.rules.json rules, then retry." : (err?.message || "Could not save profile. Please retry."); }
    finally { submit.disabled = false; }
  };
}
