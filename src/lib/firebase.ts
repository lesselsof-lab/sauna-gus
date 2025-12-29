import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAZy1a1O4Y6z8kpWuW-zwRqN2xgOXwnBBo",
  authDomain: "saunagus-for-voksne.firebaseapp.com",
  projectId: "saunagus-for-voksne",
  storageBucket: "saunagus-for-voksne.appspot.com",
  messagingSenderId: "461947614088",
  appId: "1:461947614088:web:5980a79730f86e3a29803d",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
