// migrate-ownerUid.js

const admin = require("firebase-admin");
const fs = require("fs");

// Chemin vers ta clé de service téléchargée
const serviceAccount = require("./serviceAccountKey.json");

// Initialisation Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ====== CONFIG À ADAPTER ======
const emailToUid = {
  "gael.cantarero@gmail.com": "8li14Nbw7eNgP1IZT0ZgfXqKFIg1",
  "coach.test@gmail.com": "v9hqQUoGmrTj2t9JrhGqlHYMkG32",
  "pierre.hesse@sfr.fr": "q7Ff7rUb8lXOwi9yJ7N7Cx4LX3E3"
};

async function migrateOwnerUid() {
  console.log("Début migration ownerUid sur clubTimeData...");

  const snap = await db.collection("clubTimeData").get();
  console.log(`Documents trouvés : ${snap.size}`);

  let updated = 0;
  let skippedNoEmail = 0;
  let skippedNoMapping = 0;

  const batchSize = 400;
  let batch = db.batch();
  let ops = 0;

  snap.forEach((docSnap) => {
    const data = docSnap.data();

    // Si ownerUid existe déjà, on ne touche pas
    if (data.ownerUid) {
      return;
    }

    const ownerEmail = data.ownerEmail || null;
    if (!ownerEmail) {
      skippedNoEmail++;
      return;
    }

    const uid = emailToUid[ownerEmail];
    if (!uid) {
      skippedNoMapping++;
      return;
    }

    batch.update(docSnap.ref, { ownerUid: uid });
    ops++;
    updated++;

    if (ops >= batchSize) {
      batch.commit().catch(console.error);
      batch = db.batch();
      ops = 0;
    }
  });

  if (ops > 0) {
    await batch.commit();
  }

  console.log("Migration terminée.");
  console.log("Docs mis à jour avec ownerUid :", updated);
  console.log("Docs ignorés (pas d'ownerEmail) :", skippedNoEmail);
  console.log("Docs ignorés (email non mappé)  :", skippedNoMapping);
}

migrateOwnerUid()
  .then(() => {
    console.log("OK");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Erreur migration:", err);
    process.exit(1);
  });

