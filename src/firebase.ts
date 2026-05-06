import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, updateDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';

// Konfigurasi menggunakan data dari project Firebase Anda
const firebaseConfig = {
  apiKey: "AIzaSyB_NaX68JJQzxE1aFpWfpFOU7Va3IvbDjo",
  authDomain: "aplikasi-datasheet.firebaseapp.com",
  databaseURL: "https://aplikasi-datasheet-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "aplikasi-datasheet",
  storageBucket: "aplikasi-datasheet.firebasestorage.app",
  messagingSenderId: "859653153267",
  appId: "1:859653153267:web:30e7c8e422ab97b3c67286"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Helper error handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
