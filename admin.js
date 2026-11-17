// Stesso URL di app.js
const API_URL =
    "https://script.google.com/macros/s/AKfycbyO2DIsz-KfmiQDuwRK_vp-80McO5Ohtm9usOv1FRCWVGjloTL0K27j0yI992z1F_QM/exec";

const $ = id => document.getElementById(id);

let codice = sessionStorage.getItem("admin_codice") || "";
let dati = { docenti: [], disponibilita: [], prenotazioni: [] };
const aperte = new Set(); // fasce con la riga slot espansa

// devono coincidere con Code.gs
const BLOCCO = "[INDISPONIBILE]";
const DURATA_SLOT = 15;

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
    renderDocenti();
}

// =====================================================
// TABS E FILTRI
// =====================================================

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", function() {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".tab").forEach(t => $(t.dataset.tab).classList.toggle("hidden", t !== tab));
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
        const chiuso = p.genitore === BLOCCO;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${esc(formattaData(p.data))}</td>
            <td>${esc(p.ora_inizio)} – ${esc(p.ora_fine)}</td>
            <td>${esc(nomeDocente(p.docente_id))}</td>
            ${chiuso
                ? `<td colspan="3"><span class="tag">Slot chiuso</span></td>`
                : `<td>${esc(p.genitore)}</td><td>${esc(p.alunno)}</td><td>${esc(p.classe)}</td>`}
            <td><button class="btn-ghost btn-danger" type="button">${chiuso ? "Riapri" : "Annulla"}</button></td>`;
        tr.querySelector("button").addEventListener("click", () => azione(
            chiuso
                ? `Riaprire lo slot ${formattaData(p.data)} ${p.ora_inizio}?`
                : `Annullare la prenotazione di ${p.genitore} (${formattaData(p.data)} ${p.ora_inizio})?`,
            "annulla_prenotazione",
            { docente_id: p.docente_id, data: p.data, ora_inizio: p.ora_inizio },
            chiuso ? "Slot riaperto" : "Prenotazione annullata"
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
    tbody.innerHTML = righe.length ? "" : `<tr><td colspan="6"><div class="empty">Nessuna fascia</div></td></tr>`;

    righe.forEach(d => {
        const occupati = dati.prenotazioni.filter(p =>
            String(p.docente_id) === String(d.docente_id) && p.data === d.data &&
            p.ora_inizio >= d.ora_inizio && p.ora_inizio < d.ora_fine
        );
        const chiusi = occupati.filter(p => p.genitore === BLOCCO).length;
        const prenotati = occupati.length - chiusi;
        const chiave = d.docente_id + d.data + d.ora_inizio;

        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${esc(formattaData(d.data))}</td>
            <td>${esc(d.ora_inizio)} – ${esc(d.ora_fine)}</td>
            <td>${esc(nomeDocente(d.docente_id))}</td>
            <td>${prenotati}</td>
            <td>${chiusi}</td>
            <td class="azioni">
                <button class="btn-ghost" type="button">Slot</button>
                <button class="btn-ghost btn-danger" type="button">Elimina</button>
            </td>`;

        // riga espandibile con gli slot da chiudere/riaprire
        const trSlot = document.createElement("tr");
        trSlot.className = aperte.has(chiave) ? "" : "hidden";
        trSlot.innerHTML = `<td colspan="6"><div class="slots"></div></td>`;
        renderSlotAdmin(trSlot.querySelector(".slots"), d, occupati);

        const [btnSlot, btnElimina] = tr.querySelectorAll("button");
        btnSlot.addEventListener("click", () => {
            trSlot.classList.toggle("hidden");
            aperte[trSlot.classList.contains("hidden") ? "delete" : "add"](chiave);
        });
        btnElimina.addEventListener("click", () => azione(
            prenotati
                ? `Questa fascia ha ${prenotati} prenotazioni, che resteranno nel foglio. Eliminare comunque?`
                : "Eliminare questa fascia?",
            "elimina_disponibilita",
            { docente_id: d.docente_id, data: d.data, ora_inizio: d.ora_inizio, ora_fine: d.ora_fine },
            "Fascia eliminata"
        ));
        tbody.append(tr, trSlot);
    });
}

function renderSlotAdmin(contenitore, fascia, occupati) {
    for (let t = minuti(fascia.ora_inizio); t + DURATA_SLOT <= minuti(fascia.ora_fine); t += DURATA_SLOT) {
        const ora = minutiToOra(t);
        const p = occupati.find(x => x.ora_inizio === ora);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "slot";
        btn.textContent = ora;

        if (p && p.genitore !== BLOCCO) {
            btn.classList.add("booked");
            btn.disabled = true;
            btn.title = `Prenotato: ${p.genitore}`;
        } else {
            if (p) btn.classList.add("closed");
            btn.title = p ? "Chiuso – clic per riaprire" : "Libero – clic per chiudere";
            btn.addEventListener("click", async () => {
                btn.disabled = true;
                const base = { docente_id: fascia.docente_id, data: fascia.data, ora_inizio: ora };
                try {
                    await api(p ? "annulla_prenotazione" : "blocca_slot",
                        p ? base : { ...base, ora_fine: minutiToOra(t + DURATA_SLOT) });
                    toast(p ? "Slot riaperto" : "Slot chiuso", "success");
                    await ricarica();
                } catch (err) {
                    toast(err.message, "error");
                    btn.disabled = false;
                }
            });
        }
        contenitore.appendChild(btn);
    }
}

// =====================================================
// DOCENTI
// =====================================================

$("form-docente").addEventListener("submit", async function(e) {
    e.preventDefault();
    const btn = this.querySelector("button");
    btn.disabled = true;
    try {
        await api("aggiungi_docente", { nome: $("n-nome").value.trim(), email: $("n-email").value.trim() });
        toast("Docente aggiunto", "success");
        this.reset();
        await ricarica();
    } catch (err) {
        toast(err.message, "error");
    } finally {
        btn.disabled = false;
    }
});

function renderDocenti() {
    const tbody = $("tbody-docenti");
    tbody.innerHTML = dati.docenti.length ? "" : `<tr><td colspan="5"><div class="empty">Nessun docente</div></td></tr>`;

    dati.docenti.forEach(d => {
        const fasce = dati.disponibilita.filter(x => String(x.docente_id) === String(d.id)).length;
        const pren = dati.prenotazioni.filter(x => String(x.docente_id) === String(d.id) && x.genitore !== BLOCCO).length;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${esc(d.nome)}</td>
            <td>${esc(d.email || "—")}</td>
            <td>${fasce}</td>
            <td>${pren}</td>
            <td><button class="btn-ghost btn-danger" type="button">Elimina</button></td>`;
        tr.querySelector("button").addEventListener("click", () => azione(
            `Eliminare ${d.nome}${fasce ? ` e le sue ${fasce} fasce orarie` : ""}?`,
            "elimina_docente",
            { id: d.id },
            "Docente eliminato"
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

function minuti(ora) {
    const [h, m] = String(ora).split(":").map(Number);
    return h * 60 + m;
}

function minutiToOra(t) {
    return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
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
