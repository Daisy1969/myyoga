import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from "firebase/auth";
import { 
  getFirestore, 
  connectFirestoreEmulator 
} from "firebase/firestore";
import { 
  getFunctions, 
  connectFunctionsEmulator 
} from "firebase/functions";

// Dedicated Firebase Configuration for MyYoga (myyoga-sadhana-2026)
const firebaseConfig = {
  projectId: "myyoga-sadhana-2026",
  appId: "1:1059738076562:web:5a5c4417c1d8bb6a676d4b",
  storageBucket: "myyoga-sadhana-2026.firebasestorage.app",
  apiKey: "AIzaSyCa0MPGQ5H83uN_G_7I9Ed1lRiE0EXnsto",
  authDomain: "myyoga-sadhana-2026.firebaseapp.com",
  messagingSenderId: "1059738076562"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Enable emulator redirection in local development if needed
if (window.location.hostname === "localhost") {
  console.log("[Firebase] Development mode active on localhost.");
  // Optional: connect to emulators if they are started.
  // To prevent errors when emulators are not active, we wrap them in a try-catch.
  try {
    // connectFirestoreEmulator(db, "localhost", 8080);
    // connectFunctionsEmulator(functions, "localhost", 5001);
  } catch (err) {
    console.warn("[Firebase] Could not connect to emulators:", err);
  }
}

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");

export { app, auth, db, functions, googleProvider, signInWithPopup, signOut };
