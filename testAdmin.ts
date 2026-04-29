import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

admin.initializeApp({ projectId: config.projectId });
const db = new admin.firestore.Firestore({
  projectId: config.projectId,
  databaseId: config.firestoreDatabaseId
});

db.collection('protected_clients').limit(1).get()
  .then(s => console.log('Docs:', s.size))
  .catch(console.error);
