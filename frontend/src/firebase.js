// Firebase Setup File
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// import { getAuth } from "firebase/auth"; // จะเปิดใช้งานเมื่อต้องการทำระบบล็อกอินเต็มรูปแบบ
// import { getStorage } from "firebase/storage"; // จะเปิดใช้งานเมื่อต้องการเก็บรูป

// TODO: เอา Config ตรงนี้มาจาก Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyB3Sy7NcxfrcAcFGPiIiK054jfPtdJPZW4",
  authDomain: "ecri-fda.firebaseapp.com",
  projectId: "ecri-fda",
  storageBucket: "ecri-fda.firebasestorage.app",
  messagingSenderId: "818662331051",
  appId: "1:818662331051:web:9f5f7534d0511d739c1dee",
  measurementId: "G-DPF42BD3KR"
};

// Initialize Firebase App
let app, db;

try {
  // สร้างเงื่อนไขเช็คว่ามีการใส่ config หรือยัง จะได้ไม่ error ทันที
  if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase Initialized Successfully!");
  } else {
    console.warn("Firebase config is missing. Please add it to src/firebase.js");
  }
} catch (error) {
  console.error("Error initializing Firebase", error);
}

export { db };
