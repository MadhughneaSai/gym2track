// All Firebase lives here. The SDK is DYNAMIC-imported only when a real config is
// present, so device-only mode (no config) stays 100% local with zero network deps.
//
// To enable cloud sync: paste your Firebase web config below (see FIREBASE_SETUP.md).
// Until then `isConfigured` is false and the app runs exactly as before, on localStorage.

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC1EaMnqp9p7ENXhKWy0vcRSHweo5sQ5W8",
  authDomain: "workout-9aa54.firebaseapp.com",
  projectId: "workout-9aa54",
  storageBucket: "workout-9aa54.firebasestorage.app",
  messagingSenderId: "155667643493",
  appId: "1:155667643493:web:f048618104b886793a1a8c",
  measurementId: "G-JET5TL4MZS",
};

export const isConfigured = !!FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('PASTE');

const V = 'https://www.gstatic.com/firebasejs/12.6.0';
let auth, db, A, F;

export async function initCloud() {
  if (!isConfigured) return false;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${V}/firebase-app.js`),
    import(`${V}/firebase-auth.js`),
    import(`${V}/firebase-firestore.js`),
  ]);
  A = authMod; F = fsMod;
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  auth = A.getAuth(app);
  // Offline-first cache: writes hit IndexedDB instantly and sync in the background.
  db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
  });
  return true;
}

// ---- auth ----
export const watchAuth = cb => A.onAuthStateChanged(auth, cb);
export const currentUser = () => auth?.currentUser || null;
// Firebase ID token for authenticating calls to our own backend (the coach function)
export const getIdToken = () => auth?.currentUser?.getIdToken() || Promise.resolve(null);

export async function signInGoogle() {
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await A.signInWithPopup(auth, provider);
  } catch (e) {
    // popups are fragile (blockers, COOP, installed PWAs, in-app webviews) —
    // fall back to a full-page redirect, which is far more reliable on mobile.
    const code = e?.code || '';
    if (/popup-blocked|popup-closed-by-user|cancelled-popup-request|operation-not-supported|web-storage-unsupported|internal-error/.test(code)) {
      await A.signInWithRedirect(auth, provider);
      return null; // resolves after the redirect round-trip (handled on reload)
    }
    throw e; // real config errors (e.g. unauthorized-domain) bubble up so we can show them
  }
}
// completes a redirect sign-in after the page reloads (no-op for popup flows)
export async function resolveRedirect() {
  try { return await A.getRedirectResult(auth); } catch (e) { console.error('redirect result', e); return null; }
}
export const signInEmail = (email, pw) => A.signInWithEmailAndPassword(auth, email, pw);
export const registerEmail = (email, pw) => A.createUserWithEmailAndPassword(auth, email, pw);
export const signOutUser = () => A.signOut(auth);

// ---- firestore: users/{uid}/entries/{id} + users/{uid}/meta/prefs ----
const entriesCol = uid => F.collection(db, 'users', uid, 'entries');
const prefsRef = uid => F.doc(db, 'users', uid, 'meta', 'prefs');

export function subscribeEntries(uid, cb) {
  return F.onSnapshot(
    entriesCol(uid),
    snap => cb(snap.docs.map(d => d.data())),
    err => console.error('entries subscription error', err),
  );
}
export const putEntry = (uid, entry) => F.setDoc(F.doc(entriesCol(uid), entry.id), entry);
export const removeEntry = (uid, id) => F.deleteDoc(F.doc(entriesCol(uid), id));

export async function countEntries(uid) {
  return (await F.getDocs(entriesCol(uid))).size;
}
export async function loadPrefs(uid) {
  const snap = await F.getDoc(prefsRef(uid));
  return snap.exists() ? snap.data() : null;
}
export const savePrefs = (uid, prefs) => F.setDoc(prefsRef(uid), prefs, { merge: true });

// chunked to respect Firestore's 500-op batch limit (matters only if data ever grows big)
async function runBatched(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = F.writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      if (op.del) batch.delete(op.ref); else batch.set(op.ref, op.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function uploadLocal(uid, entries, prefs) {
  const ops = entries.map(e => ({ ref: F.doc(entriesCol(uid), e.id), data: e }));
  if (prefs) ops.push({ ref: prefsRef(uid), data: prefs });
  await runBatched(ops);
}
export async function clearCloud(uid) {
  const snap = await F.getDocs(entriesCol(uid));
  await runBatched(snap.docs.map(d => ({ del: true, ref: d.ref })));
}

// wipe the coach's memory profile (users/{uid}/memories) — rules allow the owner to delete it
export async function clearMemories(uid) {
  const snap = await F.getDocs(F.collection(db, 'users', uid, 'memories'));
  await runBatched(snap.docs.map(d => ({ del: true, ref: d.ref })));
}

// read the coach's memory profile (for the "what it knows" view / backup)
export async function loadMemories(uid) {
  const snap = await F.getDocs(F.collection(db, 'users', uid, 'memories'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export const deleteMemory = (uid, id) => F.deleteDoc(F.doc(db, 'users', uid, 'memories', id));
