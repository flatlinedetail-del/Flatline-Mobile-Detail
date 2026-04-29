import admin from 'firebase-admin';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

process.env.GCLOUD_PROJECT = firebaseConfig.projectId;
process.env.GCP_PROJECT = firebaseConfig.projectId;
process.env.FIREBASE_PROJECT_ID = firebaseConfig.projectId;

admin.initializeApp({
  projectId: firebaseConfig.projectId,
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();
if (firebaseConfig.firestoreDatabaseId) {
  db.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
}

async function run() {
  try {
     const snap = await db.collection("appointments").limit(1).get();
     console.log("Admin Docs:", snap.size);
  } catch(e) { console.error(e); }
}
run();
