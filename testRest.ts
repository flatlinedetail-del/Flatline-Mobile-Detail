import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";
import fs from "fs";
const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));

process.env.GCLOUD_PROJECT = config.projectId;
process.env.GCP_PROJECT = config.projectId;

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  try {
     const snap = await getDocs(query(collection(db, "appointments"), limit(1)));
     console.log("Docs:", snap.size);
  } catch(e) { console.error(e); }
}
run();
