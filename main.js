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

if (localStorage.getItem(ALREADY_ANSWERED_KEY)) {
  document.getElementById('form').classList.add('hidden');
  document.getElementById('thankyou').classList.remove('hidden');
}

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
  }).then(() => {
    localStorage.setItem(ALREADY_ANSWERED_KEY, 'true');
    document.getElementById('form').classList.add('hidden');
    document.getElementById('thankyou').classList.remove('hidden');
  }).catch((error) => {
    alert("Error al guardar en Firebase");
    console.error(error);
  });
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

  document.getElementById("resultSummary").innerHTML = `<p><strong>Respuestas recogidas:</strong> ${total} de 58 empleados (${Math.round((total / 58) * 100)}%)</p>`;
  document.getElementById("admin").classList.remove("hidden");
}

// ✅ Login segur
const ADMIN_HASH = "cf425e2586066137dab5fa064b58d2f4c22e406f3d1aa05098106e6bdc9b0bfc";
const SALT = "MiSaltSuperSecreto123!";

async function loginAdmin(password) {
  const data = new TextEncoder().encode(password + SALT);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  const hex  = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === ADMIN_HASH;
}

document.getElementById("showResultsBtn").addEventListener("click", () => {
  document.getElementById("adminLogin").classList.remove("hidden");
});

document.getElementById("adminLoginBtn").addEventListener("click", async () => {
  const pwd = document.getElementById("adminPassword").value;
  const ok  = await loginAdmin(pwd);
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

function resetData() {
  const confirmReset = confirm("¿Estás seguro que quieres eliminar todas las respuestas?");
  if (!confirmReset) return;

  db.collection("responses").get().then(snapshot => {
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
  }).then(() => {
    localStorage.removeItem(ALREADY_ANSWERED_KEY);
    alert("Respuestas eliminadas.");
    location.reload();
  });
}

