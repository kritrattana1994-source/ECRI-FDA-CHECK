import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB3Sy7NcxfrcAcFGPiIiK054jfPtdJPZW4",
  authDomain: "ecri-fda.firebaseapp.com",
  projectId: "ecri-fda",
  storageBucket: "ecri-fda.firebasestorage.app",
  messagingSenderId: "818662331051",
  appId: "1:818662331051:web:9f5f7534d0511d739c1dee",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDocs(collection(db, 'matchedAlerts'));
  const hosps = new Set();
  snap.docs.forEach(d => {
    const data = d.data();
    const hName = String(data.Hospital_Name || data['โรงพยาบาล'] || data.hospital || '').trim();
    hosps.add(hName);
  });
  console.log('Hospitals in DB:', Array.from(hosps));
}

check().catch(console.error);
