import { db, fb } from "./firebase.js";
import { encodeEmail } from "./crypto.js";

export async function findPerson(term, currentUid) {
  const normalized = String(term || "").trim().toLowerCase();
  if (!normalized) return null;

  let uid = null;
  if (normalized.includes("@")) {
    const key = encodeEmail(normalized);
    let snap = await fb.get(fb.ref(db, `emailIndex/${key}`));
    uid = snap.val();
    // Compatibility with older records that used the same normalized dotted-email key.
    if (!uid && key !== normalized) {
      snap = await fb.get(fb.ref(db, `emailIndex/${normalized.replace(/\./g, ",")}`));
      uid = snap.val();
    }
  } else {
    const username = normalized.replace(/^@/, "");
    const snap = await fb.get(fb.ref(db, `usernames/${username}`));
    uid = snap.val();
  }
  if (!uid || uid === currentUid) return null;

  const profileSnap = await fb.get(fb.ref(db, `publicProfiles/${uid}`));
  if (!profileSnap.exists()) return null;
  const profile = profileSnap.val() || {};
  return { uid, ...profile, username: String(profile.username || "").toLowerCase() };
}

export async function sendRequest(from, to) {
  if (!from || !to || from === to) throw new Error("You cannot add yourself.");
  const [blockedA, friend, outgoing, incoming] = await Promise.all([
    fb.get(fb.ref(db, `blocked/${from}/${to}`)),
    fb.get(fb.ref(db, `friends/${from}/${to}`)),
    fb.get(fb.ref(db, `outgoingRequests/${from}/${to}`)),
    fb.get(fb.ref(db, `friendRequests/${from}/${to}`))
  ]);
  if (blockedA.exists()) throw new Error("This connection is unavailable.");
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
    await fb.set(fb.ref(db, `friends/${receiver}/${sender}`), true);
    await fb.set(fb.ref(db, `friends/${sender}/${receiver}`), true);
    const chatId = [receiver, sender].sort().join("_");
    await fb.set(fb.ref(db, `chats/${chatId}/members/${receiver}`), true);
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
