// migrate-timeData-to-clubTimeData.js

const admin = require("firebase-admin");

// Chemin vers ta clé de service (téléchargée depuis Firebase console)
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ====== CONFIG À ADAPTER SI BESOIN ======

// Récupérer l'email du coach à partir du doc user
function resolveOwnerEmail(userData) {
  // Si tu as un champ email dans users/{uid}
  if (userData && userData.email) return userData.email;

  // Sinon, retourne null (ce n'est pas bloquant pour les règles basées sur ownerUid)
  return null;
}

async function migrateTimeData() {
  console.log("Début migration users/{uid}/timeData -> clubTimeData...");

  const usersSnap = await db.collection("users").get();
  console.log(`Users trouvés : ${usersSnap.size}`);

  let created = 0;
  let skippedNoCoachId = 0;
  const batchSize = 400;
  let batch = db.batch();
  let ops = 0;

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data() || {};
    const ownerUid = userId;
    const ownerEmail = resolveOwnerEmail(userData);

    console.log(`Traitement user ${userId} (email=${ownerEmail || "N/A"})...`);

    const timeSnap = await db
      .collection("users")
      .doc(userId)
      .collection("timeData")
      .get();

    if (timeSnap.empty) {
      continue;
    }

    timeSnap.forEach((timeDoc) => {
      const data = timeDoc.data() || {};

      const coachId = data.coachId;
      if (!coachId) {
        console.warn(
          `SKIP (pas de coachId) pour user ${userId}, doc ${timeDoc.id}`
        );
        skippedNoCoachId++;
        return;
      }

      // Nouveau doc dans la collection racine clubTimeData
      const newRef = db.collection("clubTimeData").doc();

      const newData = {
        coachId: coachId,
        date: data.date || null,
        hours: data.hours || 0,
        competition: !!data.competition,
        km: data.km || 0,
        description: data.description || "",
        departurePlace: data.departurePlace || "",
        arrivalPlace: data.arrivalPlace || "",
        ownerUid: ownerUid,
        ownerEmail: ownerEmail
      };

      batch.set(newRef, newData);
      ops++;
      created++;

      if (ops >= batchSize) {
        console.log(`Commit d'un batch de ${ops} docs...`);
        batch.commit().catch(console.error);
        batch = db.batch();
        ops = 0;
      }
    });
  }

  if (ops > 0) {
    console.log(`Commit final d'un batch de ${ops} docs...`);
    await batch.commit();
  }

  console.log("Migration terminée.");
  console.log("Docs créés dans clubTimeData :", created);
  console.log("Docs ignorés (pas de coachId) :", skippedNoCoachId);
}

migrateTimeData()
  .then(() => {
    console.log("OK");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Erreur migration:", err);
    process.exit(1);
  });

