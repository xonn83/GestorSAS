import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const oldConfig = {
  projectId: "project-1467a636-3021-45cc-a8a",
  apiKey: "AIzaSyB1um45SuQ9Xu5uZzf9SYU1a-LLnwvLDCo",
  firestoreDatabaseId: "ai-studio-sasguardmanager-cf6bc013-557f-485e-9a30-3bda27053de1"
};

const newConfig = {
  apiKey: "AIzaSyAKml2mfZ_99i-lBvFXv3gK8zY47sdDdco",
  authDomain: "gestorsas.firebaseapp.com",
  projectId: "gestorsas",
  storageBucket: "gestorsas.firebasestorage.app",
  messagingSenderId: "37136597686",
  appId: "1:37136597686:web:19d09a26fc355b20aedc17"
};

async function run() {
  console.log("=== INICIANDO EXTRACCIÓN DE LA BD ANTIGUA ===");
  const oldApp = initializeApp(oldConfig, "oldApp");
  const oldDb = getFirestore(oldApp, oldConfig.firestoreDatabaseId);

  let usersSnap;
  try {
    usersSnap = await getDocs(collection(oldDb, "users"));
  } catch (err) {
    console.error("ERROR leyendo la BD antigua:", err.message);
    if (err.message.includes("permission-denied") || err.message.includes("Missing or insufficient permissions")) {
      console.log("\n[AVISO]: Recuerda habilitar temporalmente 'allow read: if true;' en las Reglas de Firestore del proyecto antiguo.");
    }
    process.exit(1);
  }

  console.log(`Encontrados ${usersSnap.docs.length} usuario(s) en la colección 'users'.`);
  const backup = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const userData = userDoc.data();
    console.log(`\n- Procesando usuario UID: ${uid} (${userData.email || userData.workerName || 'sin nombre'})`);

    let cuadranteData = null;
    try {
      const cuadranteSnap = await getDoc(doc(oldDb, "users", uid, "data", "cuadrante"));
      if (cuadranteSnap.exists()) {
        cuadranteData = cuadranteSnap.data();
        const shiftsCount = cuadranteData.calendarShifts ? Object.keys(cuadranteData.calendarShifts).length : 0;
        console.log(`  -> Cuadrante encontrado: ${shiftsCount} turnos registrados`);
      } else {
        console.log(`  -> Sin documento de cuadrante`);
      }
    } catch (e) {
      console.warn(`  -> Error leyendo cuadrante de ${uid}:`, e.message);
    }

    backup.push({
      uid,
      profile: userData,
      cuadrante: cuadranteData
    });
  }

  // Guardar copia local en disco
  const backupFile = "./backup_gestorsas_old.json";
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2), "utf-8");
  console.log(`\n✅ Copia de seguridad guardada con éxito en: ${backupFile}`);

  // Ahora transferir a la nueva BD
  console.log("\n=== VOLCANDO DATOS EN LA NUEVA BD (gestorsas) ===");
  const newApp = initializeApp(newConfig, "newApp");
  const newDb = getFirestore(newApp);

  let successCount = 0;
  for (const item of backup) {
    try {
      // 1. Guardar perfil de usuario
      await setDoc(doc(newDb, "users", item.uid), item.profile);
      console.log(`  -> Perfil migrado: ${item.uid} (${item.profile.email || item.profile.workerName})`);

      // 2. Guardar cuadrante si existe
      if (item.cuadrante) {
        await setDoc(doc(newDb, "users", item.uid, "data", "cuadrante"), item.cuadrante);
        console.log(`  -> Cuadrante migrado para: ${item.uid}`);
      }
      successCount++;
    } catch (err) {
      console.error(`  -> Error migrando ${item.uid}:`, err.message);
    }
  }

  console.log(`\n🎉 Migración finalizada: ${successCount} de ${backup.length} usuario(s) migrado(s) con éxito.`);
  process.exit(0);
}

run().catch((e) => {
  console.error("Fallo general:", e);
  process.exit(1);
});
