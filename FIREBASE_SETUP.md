# Turning on cloud sign-in (one-time, ~10 minutes)

The app already works on its own (device-only, localStorage). These steps switch it
into a real multi-user app with Google / email sign-in and a shared cloud database.
Everything happens in **your** Google account — I can't do it for you — but it's just clicks.
When you're done, paste me the config object (Step 6) and I'll wire it in.

> Free tier covers this use easily: ~10 people is a few hundred tiny writes a week,
> against a daily allowance of 20,000 writes / 50,000 reads. You will not pay anything.

---

## 1. Create the project
1. Go to **https://console.firebase.google.com** → **Create a project**.
2. Name it `Workout` (or anything). Continue.
3. Google Analytics — toggle **off** (not needed). Create project.

## 2. Register a Web App
1. On the project home, click the **`</>`** (Web) icon — "Add app".
2. Nickname `Workout`. **Leave "Firebase Hosting" unchecked.** Register app.
3. You'll see a `firebaseConfig = { ... }` block. **Keep this tab open** — it's Step 6.

## 3. Turn on sign-in methods
1. Left sidebar → **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Add new provider**:
   - **Google** → Enable → pick your email as "support email" → Save.
   - **Email/Password** → Enable (top toggle only) → Save.

## 4. Create the database
1. Left sidebar → **Build → Firestore Database → Create database**.
2. **Start in production mode** (we set proper rules in Step 5). Next.
3. Pick the region closest to you (e.g. `asia-south1` for India, `nam5` for US).
   ⚠️ Region is permanent — but it only affects latency, not features. Enable.

## 5. Paste the security rules
1. In Firestore → **Rules** tab.
2. Delete what's there and paste the contents of **`firestore.rules`** (in this folder).
   - That default makes each person able to read/write only their own data.
   - To make it **invite-only** (just your ~10 people), use the commented allowlist
     block inside that file instead and fill in the emails.
3. **Publish.**

## 6. Send me the config
Copy the whole `firebaseConfig` object from Step 2 and paste it back to me. It looks like:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "workout-xxxx.firebaseapp.com",
  projectId: "workout-xxxx",
  storageBucket: "workout-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
```

These web keys are **not secrets** — they're meant to ship in the browser; the security
rules (Step 5) are what actually protect the data. I'll drop them into `js/cloud.js`,
the sign-in gate goes live, and on your first sign-in the app offers to upload your
existing local sets to your account.

## 7. After it's deployed — authorize your domain
Once it's hosted (e.g. `workout.netlify.app`):
- Authentication → **Settings → Authorized domains → Add domain** → your host.
- `localhost` is allowed by default for local testing.

---

### Note on installed-app (Home Screen) Google sign-in
Google's popup sign-in can misbehave inside an iOS **home-screen** PWA. Easiest path:
sign in once in the **Safari tab** (before or after adding to Home Screen) — the session
then persists for months. Email/password works everywhere, including the installed app.
