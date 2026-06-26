import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// 🔑 این بخش با اطلاعات پروژه‌ی Firebase خودت پر شده
const firebaseConfig = {
  apiKey: "AIzaSyD8wuRqyJwIFfbWQdEa3bkp2nEFM-Alko8",
  authDomain: "hashar-23160.firebaseapp.com",
  databaseURL: "https://hashar-23160-default-rtdb.firebaseio.com",
  projectId: "hashar-23160",
  storageBucket: "hashar-23160.firebasestorage.app",
  messagingSenderId: "551842130593",
  appId: "1:551842130593:web:028ca0df6ed8237c5e5ee0",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);
