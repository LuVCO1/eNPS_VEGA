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

const ALREADY_ANSWERED_KEY = 'eNPS_done';
const RESET_TOKEN_KEY = 'eNPS_token';

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

  document.getElementById("exportExcelBtn").addEventListener("click", exportToExcel);
});

function submitResponse() {
  const scoreValue = document.getElementById('score').value;
  const comment = document.getElementById('comment').value.trim();

  if (scoreValue === "") {
    alert("Selecciona una puntuación válida del 0 al 10.");
    return;
  }

  const score = parseInt(scoreValue, 10);

  db.collection("responses").add({
    score: score,
    comment: comment,
    timestamp: new Date().toISOString()
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

// Seguridad admin
const ADMIN_HASH = "119c97e407d977047ca1c5d8df0993bdba8cff86cdb33f49950e69d79e21f927";
const SALT = "MiSaltSuperSecreto123!";

async function loginAdmin(password) {
  const data = new TextEncoder().encode(password + SALT);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === ADMIN_HASH;
}

async function showResults() {
  const snapshot = await db.collection("responses").get();
  const data = snapshot.docs.map(doc => doc.data());

  let promoters = 0, passives = 0, detractors = 0;

  const tableBody = document.querySelector("#resultTable tbody");
  tableBody.innerHTML = "";

  data.forEach((r, i) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td>${i + 1}</td><td>${r.score}</td><td>${r.comment || '—'}</td>`;
    tableBody.appendChild(row);

    if (r.score >= 9) promoters++;
    else if (r.score >= 7) passives++;
    else detractors++;
  });

  const total = data.length || 1;
  const eNPS = Math.round(((promoters - detractors) / total) * 100);

  const ctx = document.getElementById('eNPSChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Promotores', 'Pasivos', 'Detractores'],
      datasets: [{
        data: [promoters, passives, detractors],
        backgroundColor: ['#28a745', '#ffc107', '#dc3545']
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `Puntuación eNPS actual: ${eNPS}%`,
          font: { size: 18 }
        },
        legend: {
          position: 'bottom'
        }
      }
    }
  });

  document.getElementById("resultSummary").innerHTML =
    `<p><strong>Respuestas recogidas:</strong> ${total} de 58 empleados (${Math.round((total / 58) * 100)}%)</p>`;
  document.getElementById("admin").classList.remove("hidden");
}

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

async function exportToExcel() {
  const snapshot = await db.collection("responses").get();
  const data = snapshot.docs.map(doc => doc.data());

  let promoters = 0, passives = 0, detractors = 0;

  const rows = [["#", "Puntuación", "Comentario"]];

  data.forEach((r, i) => {
    rows.push([i + 1, r.score, r.comment || "—"]);
    if (r.score >= 9) promoters++;
    else if (r.score >= 7) passives++;
    else detractors++;
  });

  const total = data.length || 1;
  const eNPS = Math.round(((promoters - detractors) / total) * 100);

  rows.push([]);
  rows.push(["Total respuestas", total]);
  rows.push(["Puntuación eNPS", `${eNPS}%`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultados eNPS");

  XLSX.writeFile(wb, "resultados_eNPS.xlsx");
}
