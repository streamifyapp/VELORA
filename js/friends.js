import { db, fb } from "./firebase.js";
import { encodeEmail } from "./crypto.js";

const DEFAULT_AVATAR = "#635bff";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/^@/, "");
}

function profileFallback(uid, username = "") {
  return {
    uid,
    username: normalizeUsername(username) || "member",
    displayName: "Velora member",
    avatarColor: DEFAULT_AVATAR,
    _profilePending: true
  };
}

/**
 * Resolve a person using the same exact-index approach as the original
 * working Velora build. Public profile data is used when available; older
 * accounts can still be found through their username/email index even if
 * they have not generated a publicProfiles record yet.
 */
export async function findPerson(term, currentUid) {
  const raw = String(term || "").trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();
  let uid = null;
  let searchedUsername = "";

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (isEmail) {
    // Current and legacy index formats are checked for backward compatibility.
    const email = normalized;
    const candidates = [...new Set([
      encodeEmail(email),
      email,
      email.replace(/\./g, ",")
    ])];

    for (const key of candidates) {
      const snap = await fb.get(fb.ref(db, `emailIndex/${key}`));
      if (snap.exists() && typeof snap.val() === "string") {
        uid = snap.val();
        break;
      }
    }
  } else {
    searchedUsername = normalizeUsername(raw);
    if (!searchedUsername) return null;

    const indexSnap = await fb.get(fb.ref(db, `usernames/${searchedUsername}`));
    if (indexSnap.exists() && typeof indexSnap.val() === "string") {
      uid = indexSnap.val();
    }

    // Legacy accounts may have a public profile but a missing username index.
    if (!uid) {
      const profilesSnap = await fb.get(fb.ref(db, "publicProfiles"));
      const profiles = profilesSnap.val() || {};
      const match = Object.entries(profiles).find(([, profile]) =>
        normalizeUsername(profile?.username) === searchedUsername
      );
      if (match) uid = match[0];
    }
  }

  if (!uid || uid === currentUid) return null;

  // Do not read another user's private `users/{uid}` record. The original
  // account schema protects it; only publicProfiles is intended for discovery.
  try {
    const profileSnap = await fb.get(fb.ref(db, `publicProfiles/${uid}`));
    if (profileSnap.exists()) {
      const profile = profileSnap.val() || {};
      return {
        uid,
        ...profile,
        username: normalizeUsername(profile.username) || searchedUsername || "member",
        displayName: String(profile.displayName || profile.username || "Velora member"),
        avatarColor: profile.avatarColor || DEFAULT_AVATAR,
        _profilePending: false
      };
    }
  } catch (error) {
    // The index resolved the account, so retain the result and let the request
    // action show any permission/rules error. This avoids a false "no results".
    console.warn("[Velora Discover] Public profile could not be read:", error);
  }

  // Older accounts may have the index but not yet have a public profile.
  // They can still receive a friend request by UID; their profile will appear
  // fully after they sign in and refresh their public profile.
  return profileFallback(uid, searchedUsername);
}

export async function sendRequest(from, to) {
  if (!from || !to || from === to) throw new Error("You cannot add yourself.");

  const [blocked, friend, outgoing, incoming] = await Promise.all([
    fb.get(fb.ref(db, `blocked/${from}/${to}`)),
    fb.get(fb.ref(db, `friends/${from}/${to}`)),
    fb.get(fb.ref(db, `outgoingRequests/${from}/${to}`)),
    fb.get(fb.ref(db, `friendRequests/${from}/${to}`))
  ]);

  if (blocked.exists()) throw new Error("This connection is unavailable.");
  if (friend.exists()) throw new Error("You are already connected.");
  if (outgoing.exists()) throw new Error("Friend request already sent.");
  if (incoming.exists()) throw new Error("They have already requested you. Open Requests to accept.");

  const request = { from, to, createdAt: Date.now() };
  await fb.set(fb.ref(db, `friendRequests/${to}/${from}`), request);

  try {
    await fb.set(fb.ref(db, `outgoingRequests/${from}/${to}`), request);
  } catch (error) {
    await fb.remove(fb.ref(db, `friendRequests/${to}/${from}`)).catch(() => {});
    throw error;
  }
}

export async function answerRequest(receiver, sender, accept) {
  if (accept) {
    // The receiver accepts the request; the rules allow both friend edges while
    // friendRequests/{receiver}/{sender} still exists.
    await fb.set(fb.ref(db, `friends/${receiver}/${sender}`), true);
    await fb.set(fb.ref(db, `friends/${sender}/${receiver}`), true);

    // Each participant creates their own chat membership when opening the chat.
    // This avoids writing another user's protected member key.
  }

  await Promise.all([
    fb.remove(fb.ref(db, `friendRequests/${receiver}/${sender}`)),
    fb.remove(fb.ref(db, `outgoingRequests/${sender}/${receiver}`))
  ]);
}

export async function blockUser(uid, other) {
  await fb.set(fb.ref(db, `blocked/${uid}/${other}`), true);
  await Promise.all([
    fb.remove(fb.ref(db, `friends/${uid}/${other}`)),
    fb.remove(fb.ref(db, `friends/${other}/${uid}`)),
    fb.remove(fb.ref(db, `friendRequests/${uid}/${other}`)),
    fb.remove(fb.ref(db, `friendRequests/${other}/${uid}`)),
    fb.remove(fb.ref(db, `outgoingRequests/${uid}/${other}`)),
    fb.remove(fb.ref(db, `outgoingRequests/${other}/${uid}`))
  ]);
}
