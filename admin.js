// Stesso URL di app.js
const API_URL =
    "https://script.google.com/macros/s/AKfycbyO2DIsz-KfmiQDuwRK_vp-80McO5Ohtm9usOv1FRCWVGjloTL0K27j0yI992z1F_QM/exec";

const $ = id => document.getElementById(id);

let codice = sessionStorage.getItem("admin_codice") || "";
let dati = { docenti: [], disponibilita: [], prenotazioni: [] };

// =====================================================
// API
// =====================================================

async function api(action, extra = {}) {
    const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action, codice, ...extra })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || "Errore");
    return json;
}

// =====================================================
// LOGIN
// =====================================================

$("login-form").addEventListener("submit", async function(e) {
    e.preventDefault();
    const btn = this.querySelector("button");
    btn.disabled = true;
    codice = $("codice").value;
    try {
        await api("admin_login");
        sessionStorage.setItem("admin_codice", codice);
        await entra();
    } catch (err) {
        toast(err.message, "error");
    } finally {
        btn.disabled = false;
    }
});

$("logout").addEventListener("click", function() {
    sessionStorage.removeItem("admin_codice");
    location.reload();
});

async function entra() {
    $("login-view").classList.add("hidden");
    $("panel-view").classList.remove("hidden");
    await ricarica();
}

if (codice) {
    entra().catch(() => {
        sessionStorage.removeItem("admin_codice");
        location.reload();
    });
}

async function ricarica() {
    dati = await api("admin_dati");
    popolaDocenti();
    renderPrenotazioni();
    renderDisponibilita();
}

// =====================================================
// TABS E FILTRI
// =====================================================

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", function() {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    ["tab-prenotazioni", "tab-disponibilita"].forEach(id => $(id).classList.toggle("hidden", id !== tab.dataset.tab));
}));

$("f-docente").addEventListener("change", renderPrenotazioni);
$("f-data").addEventListener("change", renderPrenotazioni);
$("fd-docente").addEventListener("change", renderDisponibilita);

function popolaDocenti() {
    document.querySelectorAll(".sel-docenti").forEach(sel => {
        const val = sel.value;
        sel.innerHTML = sel.dataset.tutti ? `<option value="">Tutti i docenti</option>` : `<option value="">Seleziona...</option>`;
        dati.docenti.forEach(d => sel.appendChild(new Option(d.nome, d.id)));
        sel.value = val;
    });
}

// =====================================================
// PRENOTAZIONI
// =====================================================

function renderPrenotazioni() {
    const doc = $("f-docente").value;
    const data = $("f-data").value;

    const righe = dati.prenotazioni
        .filter(p => (!doc || String(p.docente_id) === doc) && (!data || p.data === data))
        .sort((a, b) => (a.data + a.ora_inizio).localeCompare(b.data + b.ora_inizio));

    const tbody = $("tbody-prenotazioni");
    tbody.innerHTML = righe.length ? "" : `<tr><td colspan="7"><div class="empty">Nessuna prenotazione</div></td></tr>`;

    righe.forEach(p => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${esc(formattaData(p.data))}</td>
            <td>${esc(p.ora_inizio)} – ${esc(p.ora_fine)}</td>
            <td>${esc(nomeDocente(p.docente_id))}</td>
            <td>${esc(p.genitore)}</td>
            <td>${esc(p.alunno)}</td>
            <td>${esc(p.classe)}</td>
            <td><button class="btn-ghost btn-danger" type="button">Annulla</button></td>`;
        tr.querySelector("button").addEventListener("click", () => azione(
            `Annullare la prenotazione di ${p.genitore} (${formattaData(p.data)} ${p.ora_inizio})?`,
            "annulla_prenotazione",
            { docente_id: p.docente_id, data: p.data, ora_inizio: p.ora_inizio },
            "Prenotazione annullata"
        ));
        tbody.appendChild(tr);
    });
}

// =====================================================
// DISPONIBILITÀ
// =====================================================

$("form-disp").addEventListener("submit", async function(e) {
    e.preventDefault();
    const btn = this.querySelector("button");
    btn.disabled = true;
    try {
        await api("aggiungi_disponibilita", {
            docente_id: $("d-docente").value,
            data: $("d-data").value,
            ora_inizio: $("d-inizio").value,
            ora_fine: $("d-fine").value
        });
        toast("Fascia aggiunta", "success");
        $("d-inizio").value = "";
        $("d-fine").value = "";
        await ricarica();
    } catch (err) {
        toast(err.message, "error");
    } finally {
        btn.disabled = false;
    }
});

function renderDisponibilita() {
    const doc = $("fd-docente").value;
    const righe = dati.disponibilita
        .filter(d => !doc || String(d.docente_id) === doc)
        .sort((a, b) => (a.data + a.ora_inizio).localeCompare(b.data + b.ora_inizio));

    const tbody = $("tbody-disponibilita");
    tbody.innerHTML = righe.length ? "" : `<tr><td colspan="5"><div class="empty">Nessuna fascia</div></td></tr>`;

    righe.forEach(d => {
        const prenotati = dati.prenotazioni.filter(p =>
            String(p.docente_id) === String(d.docente_id) && p.data === d.data &&
            p.ora_inizio >= d.ora_inizio && p.ora_inizio < d.ora_fine
        ).length;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${esc(formattaData(d.data))}</td>
            <td>${esc(d.ora_inizio)} – ${esc(d.ora_fine)}</td>
            <td>${esc(nomeDocente(d.docente_id))}</td>
            <td>${prenotati}</td>
            <td><button class="btn-ghost btn-danger" type="button">Elimina</button></td>`;
        tr.querySelector("button").addEventListener("click", () => azione(
            prenotati
                ? `Questa fascia ha ${prenotati} prenotazioni, che resteranno nel foglio. Eliminare comunque?`
                : "Eliminare questa fascia?",
            "elimina_disponibilita",
            { docente_id: d.docente_id, data: d.data, ora_inizio: d.ora_inizio, ora_fine: d.ora_fine },
            "Fascia eliminata"
        ));
        tbody.appendChild(tr);
    });
}

// =====================================================
// UTILITÀ
// =====================================================

async function azione(conferma, action, payload, ok) {
    if (!confirm(conferma)) return;
    try {
        await api(action, payload);
        toast(ok, "success");
        await ricarica();
    } catch (err) {
        toast(err.message, "error");
    }
}

function nomeDocente(id) {
    const d = dati.docenti.find(x => String(x.id) === String(id));
    return d ? d.nome : id;
}

function formattaData(data) {
    const [a, m, g] = String(data).split("-").map(Number);
    if (!g) return data;
    return new Date(a, m - 1, g).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function esc(t) {
    const div = document.createElement("div");
    div.textContent = t == null ? "" : t;
    return div.innerHTML;
}

let toastTimer;
function toast(testo, tipo) {
    const el = $("toast");
    el.className = `toast ${tipo}`;
    el.textContent = testo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}
