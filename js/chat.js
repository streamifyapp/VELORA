import { auth, db, fb } from "./firebase.js";
import { safeText } from "./crypto.js";
import { findPerson, sendRequest, answerRequest, blockUser } from "./friends.js";
import { backToStore } from "./secret.js";
const $ = s => document.querySelector(s);
let currentUser = null, activeFriend = null, unsubscribeMessages = null, unsubscribeRequests = null, friendCache = [], activeTab = "friends";
const chatIdFor = friend => [currentUser.uid, friend.uid].sort().join("_");
const initials = p => safeText(String((p?.displayName || p?.username || "V").trim()[0] || "V").toUpperCase());
function errText(err) { console.error(err); const code = String(err?.code || ""); const msg = String(err?.message || ""); if (code.includes("PERMISSION_DENIED") || msg.includes("PERMISSION_DENIED") || msg.toLowerCase().includes("permission_denied")) return "Firebase blocked this action. Publish the updated database.rules.json rules in Realtime Database → Rules."; if (!navigator.onLine) return "You appear to be offline. Reconnect and try again."; return msg || "Something went wrong. Check your connection and Firebase rules."; }
export async function openChat(user) {
  if (!user) return;
  currentUser = user; activeFriend = null; activeTab = "friends";
  document.body.dataset.route = "chat";
  try { sessionStorage.setItem("velora-chat-active", "1"); } catch {}
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  if (unsubscribeRequests) { unsubscribeRequests(); unsubscribeRequests = null; }
  const host = $("#chatView"); host.hidden = false; $("#premiumView").hidden = true; $("#app").hidden = true;
  document.title = "Messages · Velora";
  host.innerHTML = `<div class="chat-shell" id="chatShell"><aside class="chat-sidebar"><div class="chat-brandbar"><div class="chat-brand"><span class="chat-brand-icon">V</span><span><strong>velora</strong><small>MESSAGES</small></span></div><div class="chat-top-actions"><button class="chat-store-button" id="storeBack" title="Open store" aria-label="Open store"><span aria-hidden="true">⌂</span><span>Open store</span></button><button class="chat-icon-button chat-search-toggle" id="chatSearchToggle" title="Search chats" aria-label="Search chats" aria-expanded="false">⌕</button></div></div><div class="chat-sidebar-title"><div><p class="chat-kicker">YOUR SPACE</p><h1>Messages<span class="live-dot"></span></h1></div><button id="newMessage" class="new-message" title="Find people">＋</button></div><label class="chat-search" id="chatSearchBar" hidden><span>⌕</span><input id="friendSearch" placeholder="Search chats or people…" aria-label="Search chats and friends"></label><div class="chat-tabs"><button class="active" data-tab="friends">Chats</button><button data-tab="requests">Requests <span id="requestCount" class="request-count"></span></button><button data-tab="find">Discover</button></div><div class="friend-list" id="friendList"><div class="chat-loading"><span class="loading-orb"></span><p>Loading your conversations…</p></div></div><div class="chat-account"><div class="avatar account-avatar">${initials({displayName:user.displayName||user.email})}</div><div class="account-meta"><strong>${safeText(user.displayName || user.email || "Your account")}</strong><small>${safeText(user.email || "Signed in")}</small></div><button id="chatSettings" class="chat-icon-button" aria-label="Account settings">···</button></div></aside><section class="chat-main" id="chatMain"><div class="chat-welcome"><div class="welcome-orbit"><div class="welcome-mark">V</div><span class="orbit-dot one"></span><span class="orbit-dot two"></span><span class="orbit-dot three"></span></div><p class="chat-kicker">A LITTLE SPACE OF YOUR OWN</p><h2>Good conversations<br><span>start here.</span></h2><p>Choose a conversation or find someone new to connect with.</p><button class="chat-primary welcome-action" id="welcomeDiscover">Discover people <span>↗</span></button><div class="welcome-foot"><span class="live-dot"></span> Your private space is ready</div></div></section></div>`;
  $("#storeBack").onclick = backToStore;
  $("#chatSearchToggle").onclick = () => { const bar=$("#chatSearchBar"), button=$("#chatSearchToggle"); bar.hidden=!bar.hidden; button.setAttribute("aria-expanded",String(!bar.hidden)); if(!bar.hidden) $("#friendSearch").focus(); else { $("#friendSearch").value=""; filterFriends(""); } };
  $("#newMessage").onclick = () => switchTab("find"); $("#welcomeDiscover").onclick = () => switchTab("find");
  host.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  $("#friendSearch").addEventListener("input", e => filterFriends(e.target.value));
  $("#friendSearch").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.value.trim()) { switchTab("find"); const field = $("#findInput"); if (field) { field.value = e.target.value.trim(); doFind(); } } });
  $("#chatSettings").onclick = showSettings;
  await ensurePublicProfile(user);
  await loadFriends();
  listenRequests();
}
async function ensurePublicProfile(user) {
  try {
    const privateSnap = await fb.get(fb.ref(db, `users/${user.uid}`));
    const privateProfile = privateSnap.val() || {};
    if (privateProfile.username) {
      await fb.set(fb.ref(db, `publicProfiles/${user.uid}`), { username: privateProfile.username, displayName: privateProfile.displayName || privateProfile.username, avatarColor: privateProfile.avatarColor || "#8b7cff" });
      // Older accounts may not have a searchable email index yet.
      if (user.email) await fb.set(fb.ref(db, `emailIndex/${user.email.trim().toLowerCase().replace(/\./g, ",")}`), user.uid).catch(err => console.warn("Email search index could not be refreshed:", err));
    }
  } catch (err) { console.warn("Could not refresh public profile:", err); }
}
function switchTab(tab) {
  activeTab = tab; document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  $("#friendSearch").value = "";
  if (tab === "find") {
    $("#friendList").innerHTML = `<div class="discover-panel"><p class="chat-kicker">EXPAND YOUR CIRCLE</p><h2>Find your people.</h2><p>Search with an exact username or full email address.</p><form class="find-box" id="findForm"><span>⌕</span><input id="findInput" placeholder="@username or name@gmail.com" autocomplete="off" required><button type="submit" aria-label="Search">↗</button></form><div id="findResult" class="find-result"></div></div>`;
    $("#findForm").onsubmit = e => { e.preventDefault(); doFind(); }; $("#findInput").focus();
  } else if (tab === "requests") loadRequests(); else loadFriends();
}
async function doFind() {
  const input = $("#findInput"), out = $("#findResult"); if (!input || !out) return;
  const term = input.value.trim(); if (!term) { out.innerHTML = `<p class="inline-note">Enter a username or full email address.</p>`; return; }
  out.innerHTML = `<div class="chat-loading compact"><span class="loading-orb"></span><p>Searching…</p></div>`;
  try {
    const person = await findPerson(term, currentUser.uid);
    if (!person) { out.innerHTML = `<div class="no-results"><span>⌕</span><strong>No exact match found</strong><p>Check the spelling or ask them for their exact username.</p></div>`; return; }
    const existing = await fb.get(fb.ref(db, `friends/${currentUser.uid}/${person.uid}`));
    const outgoing = await fb.get(fb.ref(db, `outgoingRequests/${currentUser.uid}/${person.uid}`));
    const incoming = await fb.get(fb.ref(db, `friendRequests/${currentUser.uid}/${person.uid}`));
    let label = existing.exists() ? "Already connected" : outgoing.exists() ? "Request sent" : incoming.exists() ? "Accept their request in Requests" : "Add friend";
    out.innerHTML = `<article class="discover-result"><div class="avatar large-avatar" style="background:${safeText(person.avatarColor || "#635bff")}">${initials(person)}</div><div class="discover-person"><strong>${safeText(person.displayName || person.username)}</strong><small>@${safeText(person.username || "member")}</small></div><button class="chat-primary add-friend-button" id="sendFriend" ${label !== "Add friend" ? "disabled" : ""}>${label}</button></article><p class="inline-note" id="findStatus" role="status"></p>`;
    $("#sendFriend").onclick = async () => { const button = $("#sendFriend"), status = $("#findStatus"); button.disabled = true; button.textContent = "Sending…"; status.textContent = ""; try { await sendRequest(currentUser.uid, person.uid); button.textContent = "Request sent ✓"; status.textContent = "Your friend request has been sent."; } catch (err) { button.disabled = false; button.textContent = "Add friend"; status.textContent = errText(err); } };
  } catch (err) { out.innerHTML = `<div class="error-panel"><strong>Search could not finish</strong><p>${safeText(errText(err))}</p><small>Check that Firebase rules are published and both users have a profile.</small></div>`; }
}
async function loadFriends() {
  const host = $("#friendList"); if (!host || !currentUser) return;
  host.innerHTML = `<div class="chat-loading"><span class="loading-orb"></span><p>Loading chats…</p></div>`;
  try {
    const snap = await fb.get(fb.ref(db, `friends/${currentUser.uid}`)); const ids = Object.keys(snap.val() || {});
    if (!ids.length) { host.innerHTML = `<div class="empty-list"><div class="empty-icon">✳</div><strong>No conversations yet</strong><p>Your circle starts with one connection.</p><button id="emptyDiscover" class="chat-secondary">Find people ↗</button></div>`; $("#emptyDiscover").onclick = () => switchTab("find"); friendCache = []; return; }
    const people = await Promise.all(ids.map(async uid => { const ps = await fb.get(fb.ref(db, `publicProfiles/${uid}`)); return ps.exists() ? { uid, ...ps.val() } : null; }));
    friendCache = people.filter(Boolean);
    if (!friendCache.length) { host.innerHTML = `<div class="empty-list"><strong>Profiles need refreshing</strong><p>Ask your friend to sign in once, then refresh.</p></div>`; return; }
    renderFriendRows(friendCache);
  } catch (err) { host.innerHTML = `<div class="error-panel"><strong>Couldn't load chats</strong><p>${safeText(errText(err))}</p></div>`; }
}
function renderFriendRows(list) {
  const host = $("#friendList"); if (!host) return;
  host.innerHTML = list.map(person => `<button type="button" class="friend-row ${activeFriend?.uid === person.uid ? "active" : ""}" data-friend="${safeText(person.uid)}"><span class="avatar" style="background:${safeText(person.avatarColor || "#635bff")}">${initials(person)}</span><span class="friend-meta"><strong>${safeText(person.displayName || person.username)}</strong><small>@${safeText(person.username || "member")}</small></span><span class="friend-row-arrow">›</span></button>`).join("") || `<div class="empty-list"><strong>No matches</strong><p>Try another name.</p></div>`;
  host.querySelectorAll("[data-friend]").forEach(el => el.onclick = () => { const person = friendCache.find(x => x.uid === el.dataset.friend); if (person) openConversation(person); });
}
function filterFriends(term) { if (activeTab !== "friends") return; const t = term.trim().toLowerCase(); renderFriendRows(friendCache.filter(p => `${p.displayName || ""} ${p.username || ""}`.toLowerCase().includes(t))); }
function listenRequests() {
  if (unsubscribeRequests) unsubscribeRequests();
  unsubscribeRequests = fb.onValue(fb.ref(db, `friendRequests/${currentUser.uid}`), snap => {
    const count = Object.keys(snap.val() || {}).length; const badge = $("#requestCount"); if (badge) { badge.textContent = count ? String(count) : ""; badge.classList.toggle("has-count", count > 0); }
    const reqTab = document.querySelector('[data-tab="requests"]'); if (reqTab) reqTab.classList.toggle("has-notifications", count > 0);
    if (activeTab === "requests") loadRequests();
  }, err => { console.error("Request listener failed:", err); });
}
async function loadRequests() {
  const host = $("#friendList"); if (!host) return; host.innerHTML = `<div class="chat-loading"><span class="loading-orb"></span><p>Checking requests…</p></div>`;
  try {
    const snap = await fb.get(fb.ref(db, `friendRequests/${currentUser.uid}`)); const requests = Object.values(snap.val() || {});
    if (!requests.length) { host.innerHTML = `<div class="empty-list"><div class="empty-icon">✳</div><strong>You're all caught up</strong><p>New friend requests will appear here.</p></div>`; return; }
    const items = await Promise.all(requests.map(async request => { const ps = await fb.get(fb.ref(db, `publicProfiles/${request.from}`)); return { request, person: ps.val() || { username: "member", displayName: "Velora member" } }; }));
    host.innerHTML = items.map(({request,person}) => `<article class="request-row"><div class="avatar" style="background:${safeText(person.avatarColor || "#635bff")}">${initials(person)}</div><div class="friend-meta"><strong>${safeText(person.displayName || person.username)}</strong><small>@${safeText(person.username || "member")}</small><small class="request-label">Wants to connect</small></div><div class="request-actions"><button class="accept-request" data-accept="${safeText(request.from)}">Accept</button><button class="decline-request" data-decline="${safeText(request.from)}" aria-label="Decline request">×</button></div></article>`).join("");
    host.querySelectorAll("[data-accept]").forEach(button => button.onclick = async () => { button.disabled = true; try { await answerRequest(currentUser.uid, button.dataset.accept, true); await loadFriends(); } catch (err) { alert(errText(err)); button.disabled = false; } });
    host.querySelectorAll("[data-decline]").forEach(button => button.onclick = async () => { button.disabled = true; try { await answerRequest(currentUser.uid, button.dataset.decline, false); await loadRequests(); } catch (err) { alert(errText(err)); button.disabled = false; } });
  } catch (err) { host.innerHTML = `<div class="error-panel"><strong>Couldn't load requests</strong><p>${safeText(errText(err))}</p></div>`; }
}
async function openConversation(friend) {
  activeFriend = friend; const shell = $("#chatShell"), chatId = chatIdFor(friend); shell.classList.add("conversation-open");
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
  $("#chatMain").innerHTML = `<div class="conversation-header"><button class="mobile-chat-back" id="conversationBack" aria-label="Back to chats">‹</button><div class="avatar" style="background:${safeText(friend.avatarColor || "#635bff")}">${initials(friend)}</div><div class="conversation-person"><strong>${safeText(friend.displayName || friend.username)}</strong><small><span class="online-dot"></span>@${safeText(friend.username || "member")}</small></div><button id="friendOptions" class="chat-icon-button" aria-label="Conversation options">···</button></div><div class="conversation-body" id="messageList"><div class="chat-loading"><span class="loading-orb"></span><p>Loading messages…</p></div></div><form class="chat-compose" id="compose"><textarea id="messageDraft" rows="1" maxlength="5000" placeholder="Write a message…" aria-label="Message"></textarea><button type="submit" aria-label="Send message">↑</button><small>Enter to send · Shift + Enter for a new line</small></form>`;
  $("#conversationBack").onclick = () => shell.classList.remove("conversation-open"); $("#friendOptions").onclick = () => showFriendOptions(friend);
  try { await fb.set(fb.ref(db, `chats/${chatId}/members/${currentUser.uid}`), true); } catch (err) { console.warn("Could not initialize chat membership:", err); }
  const body = $("#messageList"); body.innerHTML = ""; let gotMessage = false;
  const messageRef = fb.query(fb.ref(db, `chats/${chatId}/messages`), fb.orderByKey(), fb.limitToLast(100));
  unsubscribeMessages = fb.onChildAdded(messageRef, snap => {
    gotMessage = true; const msg = snap.val() || {}; if (body.querySelector(`[data-message="${CSS.escape(snap.key)}"]`)) return;
    const row = document.createElement("div"); row.className = `message ${msg.sender === currentUser.uid ? "mine" : "theirs"}`; row.dataset.message = snap.key;
    const content = document.createElement("div"); content.className = "message-text"; content.textContent = msg.text || ""; row.append(content);
    const time = document.createElement("time"); time.textContent = new Date(Number(msg.createdAt) || Date.now()).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); row.append(time); body.append(row); body.scrollTop = body.scrollHeight;
  }, err => { body.innerHTML = `<div class="error-panel"><strong>Messages are unavailable</strong><p>${safeText(errText(err))}</p><small>Confirm both users accepted the friend request and the database rules are published.</small></div>`; });
  setTimeout(() => { if (!gotMessage && body.childElementCount === 0) body.innerHTML = `<div class="conversation-start"><span>✦</span><strong>This is the beginning.</strong><p>Say hello to ${safeText(friend.displayName || friend.username)}.</p></div>`; }, 700);
  $("#compose").onsubmit = async e => { e.preventDefault(); const input = $("#messageDraft"), text = input.value.trim(); if (!text) return; const submit = e.currentTarget.querySelector("button[type=submit]"); submit.disabled = true;
    try { await fb.push(fb.ref(db, `chats/${chatId}/messages`), { sender: currentUser.uid, text, createdAt: Date.now(), type: "text" }); input.value = ""; input.style.height = "auto"; }
    catch (err) { alert(`Message not sent. ${errText(err)}`); } finally { submit.disabled = false; input.focus(); }
  };
  $("#messageDraft").addEventListener("input", e => { e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`; });
  $("#messageDraft").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#compose").requestSubmit(); } });
}
async function showFriendOptions(friend) { const action = prompt("Type BLOCK to block this person, or CANCEL to close."); if (action?.toUpperCase() === "BLOCK") { try { await blockUser(currentUser.uid, friend.uid); activeFriend = null; $("#chatShell").classList.remove("conversation-open"); await loadFriends(); } catch (err) { alert(errText(err)); } } }
function showSettings() {
  const host = $("#friendList"); host.innerHTML = `<div class="settings-panel"><p class="chat-kicker">ACCOUNT</p><h2>Your settings</h2><p class="settings-email">${safeText(currentUser.email || "Signed in")}</p><button id="backFriends" class="chat-secondary">Back to chats</button><button id="signOut" class="chat-danger">Sign out</button></div>`;
  $("#signOut").onclick = async () => { try { if (unsubscribeMessages) unsubscribeMessages(); if (unsubscribeRequests) unsubscribeRequests(); await fb.signOut(auth); backToStore(); } catch (err) { alert(errText(err)); } };
  $("#backFriends").onclick = loadFriends;
}
