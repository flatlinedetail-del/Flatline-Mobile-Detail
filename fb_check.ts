import fs from 'fs';
const content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const fbFn = ["doc", "updateDoc", "getDoc", "setDoc", "collection", "query", "onSnapshot", "addDoc", "deleteDoc", "orderBy", "Timestamp", "serverTimestamp", "getDocs", "limit", "ref", "uploadBytes", "getDownloadURL", "uploadBytesResumable", "db", "auth", "storage", "handleFirestoreError", "OperationType"];

for (const fn of fbFn) {
  // Simple regex for usage, ensure it's not just part of another word
  const rx = new RegExp('\\b' + fn + '\\b', 'g');
  const matches = content.match(rx);
  if (!matches || matches.length <= 1) { // 1 match is the import itself
    console.log('Unused FB func: ' + fn);
  }
}
