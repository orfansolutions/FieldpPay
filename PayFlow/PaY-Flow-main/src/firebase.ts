import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Use initializeFirestore with experimentalForceLongPolling to fix "unavailable" errors
// This is more robust in restricted network environments (proxies, firewalls, etc.)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Test connection to Firestore with retries
async function testConnection(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // Test read from a public path defined in firestore.rules
      await getDocFromServer(doc(db, 'public', 'config'));
      console.log("Firestore connection successful.");
      return;
    } catch (error) {
      const err = error as any;
      if (i === retries - 1) {
        if (err.code === 'unavailable') {
          console.error("Firestore Error [unavailable]: The backend is currently unreachable. This often happens if the database is still being provisioned, or if there's a strict network policy blocking the connection.");
        } else if (err.code === 'permission-denied') {
          // This is actually a good sign of connection - it means we reached the server but rules blocked us.
          console.log("Firestore reachability confirmed (permission check succeeded).");
        } else {
          console.error(`Firestore connection failed with code [${err.code}]:`, err.message);
        }
      } else {
        console.warn(`Firestore connection attempt ${i + 1} failed, retrying in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}
testConnection();
