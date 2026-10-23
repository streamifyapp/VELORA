# Velora — luxury fashion PWA starter

A static, GitHub Pages-ready fashion storefront with a Firebase-powered private-membership area. This is a functional starter, not a security-audited messaging product. The shop, product modal, local bag/wishlist, membership mock checkout, referral hash gate, Firebase email auth, username claim, exact-match people search, friend requests and basic 1:1 text messaging are included. Voice notes, uploads, E2E encryption, message editing/reactions/read receipts, robust server-side domain enforcement and comprehensive abuse controls are **not implemented** in this starter and should not be represented as production-complete.

## Plan and flow
- **Files:** `index.html`, `css/`, `js/`, `icons/`, `sw.js`, `offline.html`, manifest/version metadata, Firebase rules and this README.
- **Data:** `users/{uid}`, `usernames/{lowercaseName}`, `emailIndex/{encodedEmail}`, `friendRequests/{receiverUid}/{senderUid}`, `friends/{uid}/{otherUid}`, `chats/{sortedUidA_sortedUidB}/members` and `messages`, plus `presence`, `typing`, and `appMeta/version`.
- **Access:** Store header Premium → membership preview → referral-code input → email sign-in/create account → first-time username setup → friends / find people → 1:1 text conversation. “Collections” returns to the store.
- **Updates:** `version.json` is polled every 60 seconds and on focus/visibility/online/pageshow. The Firebase `appMeta/version` node acts as a push trigger; a changed value is confirmed against `version.json` before reload.

## Deploy to GitHub Pages
1. Create a repository (or upload these files into the root of your repository). Keep all paths relative; this supports GitHub Pages project subfolders.
2. In `js/config.js`, verify the Firebase config, set `ALLOWED_EMAIL_SUFFIX` to the suffix you will actually use, and choose session/local auth persistence.
3. Enable **Authentication → Sign-in method → Email/Password** in Firebase. Leave Email link disabled. Add your deployed GitHub Pages hostname under Authentication → Settings → Authorized domains.
4. Create/enable Realtime Database and Storage. Review and publish `database.rules.json` in Realtime Database → Rules. Publish `storage.rules` in Storage → Rules after changing the allowed-domain regex to match your chosen suffix.
5. Set the initial `appMeta/version` string to `1.0.0` in Realtime Database. The public read exception for this one version node is intentional; clients cannot write it.
6. Push to GitHub and enable Pages. Test the published HTTPS site on a phone and desktop, then use browser DevTools to check Firebase permissions and service-worker registration.

## Important security notes
- A Firebase web config is public by design; **Firebase Security Rules**, Authentication and least-privilege access protect data.
- The referral-code hash is present in browser JavaScript and can be extracted or bypassed by a determined visitor. It is a UI gate, not server-side authentication. Do not rely on it to protect sensitive data.
- Firebase Realtime Database rules do not provide a generic JavaScript `endsWith()` function. The provided starter rules do not enforce the requested email suffix consistently for every node. For actual enforcement, use a trusted backend/custom claims or carefully tested `matches()` expressions on each applicable rule. Likewise, the provided rules are a starting point and require a full rules-unit-test review before production.
- Do not store passwords outside Firebase Auth. Password recovery is not enabled here; users should remember the password. Do not enter real payment card data into the fake checkout.
- Client-side-only controls can be bypassed. Use real security rules, tested access-control paths, and security review before relying on private messages.

## Firebase setup checklist
1. Authentication → Sign-in method → Email/Password → Enable. Leave Email link off.
2. Authentication → Settings → Authorized domains → add your GitHub Pages host (e.g. `yourname.github.io`).
3. Realtime Database → Rules: paste and test `database.rules.json`. The `appMeta/version` node must be readable publicly and never client-writable.
4. Storage → Rules: replace `your-approved-domain.example` in `storage.rules` with the domain pattern matching the email suffix you use. The default config suffix is deliberately a placeholder.
5. Authentication → Users → Add user can be used to create accounts manually. To restrict self-service sign-up, disable/limit account creation in your auth architecture; the web client currently exposes Create account, so remove that tab and enforce the policy with a trusted backend if you only want admin-created accounts.
6. The email index and username index use Firebase keys, with `.` replaced by `,` in email keys. Test duplicate claims and account deletion cleanup.

## Database shape
```json
{
  "users": {"uid": {"username":"name","displayName":"Name","avatarColor":"#80684d"}},
  "usernames": {"name":"uid"},
  "emailIndex": {"name@domain,com":"uid"},
  "friendRequests": {"receiverUid":{"senderUid":{"from":"senderUid","to":"receiverUid","createdAt":0}}},
  "friends": {"uid":{"otherUid":true}},
  "chats": {"sortedUidA_sortedUidB":{"members":{"uidA":true,"uidB":true},"messages":{"pushId":{"sender":"uidA","text":"Hello","createdAt":0}}}},
  "presence": {"uid":{"state":"online","lastSeen":0}},
  "typing": {"chatId":{"uid":true}},
  "appMeta": {"version":"1.0.0"}
}
```

## Icons
All requested PNG sizes, multi-size ICO, SVG source files and OG image are included under `icons/`. They were generated from the original Velora V monogram design. `tools/generate-icons.html` is also provided as an in-browser fallback generator.

## Releasing a version
1. Change `APP_VERSION` in `js/config.js` and `"version"` in `version.json`.
2. Change `CACHE_NAME` in `sw.js` to `velora-v<new-version>` (service workers cannot import the module config directly).
3. Commit and push; wait for GitHub Pages deployment.
4. Set `appMeta/version` in Firebase Realtime Database to the same version. Open clients confirm the value against `version.json` and refresh. If you skip the Firebase update, polling/focus checks still detect `version.json`.
5. Verify the footer version label and check an installed PWA as well as browser tabs.

## Generate a new SHA-256 referral hash
Use the browser console or a local Node/Python tool to hash a new code. Example browser-console snippet (enter your new value locally; don't commit the plain text):
```js
const code = prompt("Enter the new referral code locally");
const bytes = new TextEncoder().encode(code.trim());
const digest = await crypto.subtle.digest("SHA-256", bytes);
const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
console.log(hash);
```
Paste the result into `REFERRAL_CODE_HASH` in `js/config.js`. Never put a real code into source comments or README. Note that a client-side hash is not a strong security boundary.

## Limitations to address before production
This release focuses on a working starter flow and visual storefront. It does not implement every feature in the long specification: message attachments/voice notes, client-side E2E encryption, disappearing/view-once messages, full message pagination/search/edit/delete/reactions, online presence, delivery/read receipts, typing indicators, robust offline send queue, image compression, or production-grade chat membership/rules enforcement. Those need additional implementation and security testing.
