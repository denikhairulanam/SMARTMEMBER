import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyApTTgCk4_aISbWGpNjwDA1yJgYUiktLiM",
  authDomain: "member-card-a14eb.firebaseapp.com",
  projectId: "member-card-a14eb",
  storageBucket: "member-card-a14eb.firebasestorage.app",
  messagingSenderId: "511411856555",
  appId: "1:511411856555:web:d05f3a2cbb35208b1b43ee",
  measurementId: "G-X6HQJX7P5Z"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);