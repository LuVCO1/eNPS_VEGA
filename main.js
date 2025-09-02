// ------------------------------
// main.js - Encuesta eNPS VEGA Chargers
// ------------------------------

// Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCI6wQ1s57ZDLcBpR31vQ-Iu67JEOCnMWk",
  authDomain: "vega-enps.firebaseapp.com",
  projectId: "vega-enps",
  storageBucket: "vega-enps.firebasestorage.app",
  messagingSenderId: "950555604990",
  appId: "1:950555604990:web:7fcf1138b1e1c741fbb2af",
  measurementId: "G-7983497W5N"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Claves localStorage
const ALREADY_ANSWERED_KEY = 'eNPS_done';
const RESET_TOKEN_KEY = 'eNPS_token';

// Ajustes
const EMPLOYEE_COUNT = 50; // ahora sois 50
let enpsChartInstance = null; // para evitar duplicar el gráfico

// Esquemas de clasificación eNPS
// US: Prom 9–10, Pas 7–8, Det 0–6
// EU: Prom 8–10, Pas 6–7, Det 0–5
const SCHEMES = {
  US: {
    promoter: s => s >= 9,
    passive:  s => s >= 7 && s <= 8,
    detractor:s => s <= 6
  },
  EU: {
    promoter: s => s >= 8,
    passive:  s => s >= 6 && s <= 7,
    detractor:s => s <= 5
  }
};

function countByScheme(scores, scheme) {
  let p = 0, pa = 0, d = 0;
  for (const s of scores) {
    if (scheme.promoter(s)) p++;
    else if (scheme.passive(s)) pa++;
    else d++;
  }
  return { promoters: p, passives: pa, detractors: d, total: scores.length };
}

function enpsFromCounts({ promoters, detractors, total }) {
  if (!total) return 0;
  return Math.round(((promoters - detractors) / total) * 100);
}

// Comprueba si puede votar (flag + resetToken)
async function checkIfCanVote() {
  try {
    const tokenDoc = await db.collection("resetToken").doc("resetToken").get();
    const firebaseToken = tokenDoc.exists ? tokenDoc.data().token : "";
    const localAnswered = localStorage.getItem(ALREADY_ANSWERED_KEY) === "true";
    const localToken = localStorage.getItem(RESET_TOKEN_KEY);

    if (localAnswered && localToken === firebaseToken) {
      document.getElementById('form').classList.add('hidden');
      document.getElementById('thankyou').classList.remove('hidden');
    }
  } catch (err) {
    console.error("Error al comprobar si se puede votar:", err);
  }
}

// Listeners
document.addEventListener("DOMContentLoaded", () => {
  checkIfCanVote();

  document.getElementById("showResultsBtn").addEventListener("click", () => {
    document.getElementById("adminLogin").classList.remove("hidden");
  });

  document.getElementById("adminLoginBtn").addEventListener("click", async () => {
    const pwd = document.getElementById("adminPassword").value;
    const ok = await loginAdmin(pwd);
    const msg = document.getElementById("message");

    if (ok) {
      msg.textContent = "✅ Bienvenido, admin";
      msg.style.color = "green";
      document.getElementById("adminLogin").classList.add("hidden");
      showResults();
    } else {
      msg.textContent = "🚫 Contraseña incorrecta";
      msg.style.color = "red";
    }
  });

  const exportBtn = document.getElementById("exportExcelBtn");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportToExcel);
  }
});

// Envío de respuesta
function submitResponse() {
  const scoreValue = document.getElementById('score').value;
  const comment = document.getElementById('comment').value.trim();

  if (scoreValue === "") {
    alert("Selecciona una puntuación válida del 0 al 10.");
    return;
  }

  const score = parseInt(scoreValue, 10);

  db.collection("responses").add({
    score,
    comment,
    timestamp: firebase.firestore.FieldValue.serverTimestamp() // hora de servidor
  }).then(async () => {
    const tokenDoc = await db.collection("resetToken").doc("resetToken").get();
    const firebaseToken = tokenDoc.exists ? tokenDoc.data().token : "";

    localStorage.setItem(ALREADY_ANSWERED_KEY, "true");
    localStorage.setItem(RESET_TOKEN_KEY, firebaseToken);

    document.getElementById('form').classList.add('hidden');
    document.getElementById('thankyou').classList.remove('hidden');
  }).catch((error) => {
    alert("Error al guardar en Firebase");
    console.error(error);
  });
}

// Seguridad admin (hash simple lado cliente)
const ADMIN_HASH = "119c97e407d977047ca1c5d8df0993bdba8cff86cdb33f49950e69d79e21f927";
const SALT = "MiSaltSuperSecreto123!";

async function loginAdmin(password) {
  const data = new TextEncoder().encode(password + SALT);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === ADMIN_HASH;
}

// Mostrar resultados
async function showResults() {
  const snapshot = await db.collection("responses").orderBy("timestamp", "asc").get();
  const data = snapshot.docs.map(doc => doc.data());
  const scores = data.map(r => r.score);

  // Conteos por esquema
  const countsUS = countByScheme(scores, SCHEMES.US);
  const countsEU = countByScheme(scores, SCHEMES.EU);

  const eNPS_US = enpsFromCounts(countsUS);
  const eNPS_EU = enpsFromCounts(countsEU);

  // Construir tabla (sin inyectar HTML inseguro)
  const tableBody = document.querySelector("#resultTable tbody");
  tableBody.innerHTML = "";
  data.forEach((r, i) => {
    const row = document.createElement('tr');

    const tdIdx = document.createElement('td');
    tdIdx.textContent = String(i + 1);

    const tdScore = document.createElement('td');
    tdScore.textContent = String(r.score);

    const tdComment = document.createElement('td');
    tdComment.textContent = r.comment || '—';

    row.appendChild(tdIdx);
    row.appendChild(tdScore);
    row.appendChild(tdComment);
    tableBody.appendChild(row);
  });

  // Gráfico (US por defecto). Evita duplicados destruyendo el anterior
  if (enpsChartInstance) enpsChartInstance.destroy();
  const ctx = document.getElementById('eNPSChart').getContext('2d');
  enpsChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Promotores', 'Pasivos', 'Detractores'],
      datasets: [{
        data: [countsUS.promoters, countsUS.passives, countsUS.detractors],
        backgroundColor: ['#28a745', '#ffc107', '#dc3545']
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: (countsUS.total > 0)
            ? `Puntuación eNPS (EE. UU.) actual: ${eNPS_US}%`
            : 'Sin respuestas aún',
          font: { size: 18 }
        },
        legend: { position: 'bottom' }
      }
    }
  });

  // Resumen y badges US/EU
  const pct = countsUS.total > 0 ? Math.round((countsUS.total / EMPLOYEE_COUNT) * 100) : 0;
  document.getElementById("resultSummary").innerHTML =
    `<p><strong>Respuestas recogidas:</strong> ${countsUS.total} de ${EMPLOYEE_COUNT} empleados (${pct}%)</p>` +
    (countsUS.total > 0
      ? `<p><strong>Detalle (EE. UU.):</strong> Promotores: ${countsUS.promoters} | Pasivos: ${countsUS.passives} | Detractores: ${countsUS.detractors}</p>`
      : `<p>Aún no hay datos para calcular el eNPS.</p>`);

  const badgeUS = document.getElementById("enpsUS");
  const badgeEU = document.getElementById("enpsEU");
  if (badgeUS) badgeUS.textContent = (countsUS.total > 0) ? `${eNPS_US}%` : '—';
  if (badgeEU) badgeEU.textContent = (countsEU.total > 0) ? `${eNPS_EU}%` : '—';

  document.getElementById("admin").classList.remove("hidden");
}

// Resetear datos + regenerar token
function generateResetToken() {
  return Math.random().toString(36).substring(2, 12);
}

function resetData() {
  const confirmReset = confirm("¿Estás seguro que quieres eliminar todas las respuestas?");
  if (!confirmReset) return;

  db.collection("responses").get().then(snapshot => {
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
  }).then(() => {
    const newToken = generateResetToken();
    return db.collection("resetToken").doc("resetToken").set({ token: newToken });
  }).then(() => {
    alert("Respuestas eliminadas. Todos los empleados podrán volver a contestar.");
    location.reload();
  }).catch(err => {
    alert("Error al reiniciar datos.");
    console.error(err);
  });
}

// Exportar a Excel con ambos esquemas
async function exportToExcel() {
  const snapshot = await db.collection("responses").orderBy("timestamp", "asc").get();
  const data = snapshot.docs.map(doc => doc.data());
  const scores = data.map(r => r.score);

  const countsUS = countByScheme(scores, SCHEMES.US);
  const countsEU = countByScheme(scores, SCHEMES.EU);

  const eNPS_US = enpsFromCounts(countsUS);
  const eNPS_EU = enpsFromCounts(countsEU);

  const rows = [["#", "Puntuación", "Comentario", "Fecha (local)"]];
  data.forEach((r, i) => {
    const date = r.timestamp?.toDate ? r.timestamp.toDate() : (r.timestamp ? new Date(r.timestamp) : null);
    const dateStr = date ? date.toLocaleString() : "";
    rows.push([i + 1, r.score, r.comment || "—", dateStr]);
  });

  rows.push([]);
  rows.push(["Total respuestas", countsUS.total]);
  rows.push(["Promotores (US 9-10)", countsUS.promoters]);
  rows.push(["Pasivos (US 7-8)", countsUS.passives]);
  rows.push(["Detractores (US 0-6)", countsUS.detractors]);
  rows.push(["eNPS (EE. UU.)", countsUS.total ? `${eNPS_US}%` : "N/A"]);
  rows.push([]);
  rows.push(["Promotores (EU 8-10)", countsEU.promoters]);
  rows.push(["Pasivos (EU 6-7)", countsEU.passives]);
  rows.push(["Detractores (EU 0-5)", countsEU.detractors]);
  rows.push(["eNPS (Europa)", countsEU.total ? `${eNPS_EU}%` : "N/A"]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 60 }, { wch: 22 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados eNPS");
  XLSX.writeFile(wb, "resultados_eNPS.xlsx");
}
