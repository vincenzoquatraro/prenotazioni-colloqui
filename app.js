// =====================================================
// CONFIGURAZIONE
// =====================================================

const API_URL =
    "https://script.google.com/macros/s/AKfycbyO2DIsz-KfmiQDuwRK_vp-80McO5Ohtm9usOv1FRCWVGjloTL0K27j0yI992z1F_QM/exec";

const DURATA_SLOT = 15;

// =====================================================
// ELEMENTI E STATO
// =====================================================

const $ = id => document.getElementById(id);

const slotContainer = $("slot-container");
const datiCard = $("dati-card");
const genitoreInput = $("genitore");
const alunnoInput = $("alunno");
const classeInput = $("classe");
const prenotaBtn = $("prenota-btn");
const message = $("message");

let docenti = [];
let disponibilita = [];
let prenotazioni = [];

let docente = null;          // maestra selezionata
let dataSelezionata = "";    // yyyy-mm-dd
let slotSelezionato = null;
let meseVisto = null;        // Date al primo del mese mostrato

document.addEventListener("DOMContentLoaded", caricaDati);
prenotaBtn.addEventListener("click", prenota);

document.querySelectorAll("[data-back]").forEach(btn =>
    btn.addEventListener("click", () => mostraVista(btn.dataset.back))
);

$("cal-prev").addEventListener("click", () => cambiaMese(-1));
$("cal-next").addEventListener("click", () => cambiaMese(1));

// =====================================================
// CARICAMENTO DATI
// =====================================================

async function caricaDati() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error(`Errore HTTP ${response.status}`);

        const data = await response.json();
        if (!data.success) throw new Error(data.message || "Errore Apps Script");

        docenti = data.docenti || [];
        disponibilita = data.disponibilita || [];
        prenotazioni = data.prenotazioni || [];

        renderDocenti();
    } catch (error) {
        console.error("Errore caricamento:", error);
        $("docenti-grid").innerHTML = "";
        mostraMessaggio("Non riesco a collegarmi al sistema di prenotazione. Riprova tra poco.", "error");
    }
}

// =====================================================
// NAVIGAZIONE
// =====================================================

function mostraVista(id) {
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("hidden", v.id !== id));
    if (id !== "view-orari") nascondiDati();
    if (id === "view-calendario") renderCalendario();
    message.innerHTML = "";
    message.className = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// =====================================================
// 1. MAESTRE
// =====================================================

function renderDocenti() {
    const grid = $("docenti-grid");
    grid.innerHTML = "";

    if (docenti.length === 0) {
        grid.innerHTML = `<div class="empty">Nessun docente disponibile</div>`;
        return;
    }

    docenti.forEach(function(d) {
        const giorni = giorniLiberi(d.id).length;
        const card = document.createElement("button");
        card.type = "button";
        card.className = "teacher-card";
        card.disabled = giorni === 0;
        card.innerHTML = `
            ${avatar(d)}
            <span class="teacher-name">${escapeHtml(d.nome)}</span>
            <span class="teacher-meta">${giorni === 0 ? "Nessuna data libera" : giorni === 1 ? "1 giorno disponibile" : `${giorni} giorni disponibili`}</span>`;
        card.addEventListener("click", () => scegliDocente(d));
        grid.appendChild(card);
    });
}

function scegliDocente(d) {
    docente = d;
    dataSelezionata = "";
    const primo = giorniLiberi(d.id)[0];
    meseVisto = primo ? inizioMese(dataLocale(primo)) : inizioMese(new Date());

    document.querySelectorAll(".who").forEach(el => {
        el.innerHTML = `${avatar(d, "sm")}<span>${escapeHtml(d.nome)}</span>`;
    });
    mostraVista("view-calendario");
}

// =====================================================
// 2. CALENDARIO
// =====================================================

function cambiaMese(delta) {
    meseVisto = new Date(meseVisto.getFullYear(), meseVisto.getMonth() + delta, 1);
    renderCalendario();
}

function renderCalendario() {
    const liberi = new Set(giorniLiberi(docente.id));
    const conFasce = new Set(giorniDocente(docente.id));
    const anno = meseVisto.getFullYear();
    const mese = meseVisto.getMonth();
    const oggi = oggiIso();

    $("cal-titolo").textContent = meseVisto.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

    const fineMese = isoDa(new Date(anno, mese + 1, 0));
    $("cal-prev").disabled = isoDa(meseVisto) <= oggi.substring(0, 8) + "01";
    $("cal-next").disabled = ![...liberi].some(g => g > fineMese);

    const grid = $("calendario");
    grid.innerHTML = ["L", "M", "M", "G", "V", "S", "D"]
        .map(g => `<div class="cal-dow">${g}</div>`).join("");

    // lunedì come primo giorno della settimana
    const offset = (new Date(anno, mese, 1).getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.insertAdjacentHTML("beforeend", `<div></div>`);

    const giorniNelMese = new Date(anno, mese + 1, 0).getDate();
    for (let g = 1; g <= giorniNelMese; g++) {
        const iso = isoDa(new Date(anno, mese, g));
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cal-day";
        btn.textContent = g;

        if (iso === oggi) btn.classList.add("today");

        if (liberi.has(iso)) {
            btn.classList.add("available");
            btn.setAttribute("aria-label", formattaData(iso) + ", posti liberi");
            btn.addEventListener("click", () => scegliGiorno(iso));
        } else {
            btn.disabled = true;
            if (conFasce.has(iso) && iso >= oggi) {
                btn.classList.add("full");
                btn.title = "Tutto prenotato";
            }
        }
        grid.appendChild(btn);
    }
}

// =====================================================
// 3. ORARI
// =====================================================

function scegliGiorno(iso) {
    dataSelezionata = iso;
    const d = dataLocale(iso);
    $("giorno-settimana").textContent = d.toLocaleDateString("it-IT", { weekday: "long" });
    $("giorno-numero").textContent = d.getDate();
    $("giorno-mese").textContent = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

    mostraVista("view-orari");
    renderSlot();
}

function renderSlot() {
    nascondiDati();
    slotContainer.innerHTML = "";

    const slots = calcolaSlot(docente.id, dataSelezionata);

    if (slots.length === 0) {
        slotContainer.innerHTML = `<div class="empty">Nessun appuntamento disponibile</div>`;
        return;
    }

    slots.forEach(function(slot) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slot";
        button.textContent = `${slot.ora_inizio} – ${slot.ora_fine}`;

        if (slot.occupato) {
            button.classList.add("booked");
            button.disabled = true;
            button.title = "Già prenotato";
        } else {
            button.addEventListener("click", () => selezionaSlot(button, slot));
        }
        slotContainer.appendChild(button);
    });
}

function selezionaSlot(button, slot) {
    slotContainer.querySelectorAll(".slot.selected").forEach(el => el.classList.remove("selected"));
    button.classList.add("selected");
    slotSelezionato = slot;

    $("riepilogo").textContent = `${docente.nome} · ${formattaData(slot.data)} · ${slot.ora_inizio} – ${slot.ora_fine}`;

    datiCard.classList.remove("hidden");
    datiCard.scrollIntoView({ behavior: "smooth", block: "center" });
    genitoreInput.focus({ preventScroll: true });
}

function nascondiDati() {
    slotSelezionato = null;
    datiCard.classList.add("hidden");
}

// =====================================================
// PRENOTA
// =====================================================

async function prenota() {
    if (!slotSelezionato) {
        mostraMessaggio("Seleziona prima un orario.", "error");
        return;
    }

    const genitore = genitoreInput.value.trim();
    const alunno = alunnoInput.value.trim();
    const classe = classeInput.value.trim();

    if (!genitore || !alunno || !classe) {
        mostraMessaggio("Compila tutti i campi.", "error");
        return;
    }

    prenotaBtn.disabled = true;
    prenotaBtn.textContent = "Prenotazione in corso...";

    const slot = slotSelezionato;

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                docente_id: docente.id,
                data: slot.data,
                ora_inizio: slot.ora_inizio,
                ora_fine: slot.ora_fine,
                genitore,
                alunno,
                classe
            })
        });

        const result = await response.json();

        if (!result.success) {
            await caricaDati();
            renderSlot();
            mostraMessaggio(escapeHtml(result.message || "Prenotazione non riuscita."), "error");
            return;
        }

        genitoreInput.value = "";
        alunnoInput.value = "";
        classeInput.value = "";

        await caricaDati();
        renderSlot();

        mostraMessaggio(`
            <strong>✓ Prenotazione confermata</strong><br><br>
            ${escapeHtml(docente.nome)}<br>
            <span style="text-transform:capitalize">${formattaData(slot.data)}</span>, ${slot.ora_inizio} – ${slot.ora_fine}<br><br>
            Alunno: ${escapeHtml(alunno)} (${escapeHtml(classe)})
        `, "success");
        message.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
        console.error("Errore prenotazione:", error);
        mostraMessaggio("Si è verificato un errore durante la prenotazione.", "error");
    } finally {
        prenotaBtn.disabled = false;
        prenotaBtn.textContent = "Conferma prenotazione";
    }
}

// =====================================================
// CALCOLI SU DISPONIBILITÀ
// =====================================================

function giorniDocente(docenteId) {
    return [...new Set(
        disponibilita
            .filter(d => String(d.docente_id) === String(docenteId))
            .map(d => normalizzaData(d.data))
    )].sort();
}

// giorni futuri con almeno uno slot libero
function giorniLiberi(docenteId) {
    const oggi = oggiIso();
    return giorniDocente(docenteId)
        .filter(g => g >= oggi && calcolaSlot(docenteId, g).some(s => !s.occupato));
}

function calcolaSlot(docenteId, data) {
    const slots = [];
    disponibilita
        .filter(d => String(d.docente_id) === String(docenteId) && normalizzaData(d.data) === data)
        .forEach(function(fascia) {
            const fine = convertiMinuti(fascia.ora_fine);
            for (let t = convertiMinuti(fascia.ora_inizio); t + DURATA_SLOT <= fine; t += DURATA_SLOT) {
                const ora_inizio = minutiToOra(t);
                slots.push({
                    data,
                    ora_inizio,
                    ora_fine: minutiToOra(t + DURATA_SLOT),
                    occupato: prenotazioni.some(p =>
                        String(p.docente_id) === String(docenteId) &&
                        normalizzaData(p.data) === data &&
                        normalizzaOra(p.ora_inizio) === ora_inizio
                    )
                });
            }
        });
    return slots.sort((a, b) => a.ora_inizio.localeCompare(b.ora_inizio));
}

// =====================================================
// UTILITÀ
// =====================================================

function avatar(d, size = "") {
    const cls = `avatar ${size}`;
    if (d.foto) return `<img class="${cls}" src="${escapeHtml(d.foto).replace(/"/g, "&quot;")}" alt="">`;
    // iniziali senza titoli tipo "Prof.ssa", "Maestra"
    const parole = String(d.nome).split(/\s+/).filter(p => p && !p.endsWith(".") && !/^maestr[ao]$/i.test(p));
    const iniziali = (parole.length ? parole : [d.nome]).slice(0, 2).map(p => p[0].toUpperCase()).join("");
    return `<span class="${cls}" aria-hidden="true">${escapeHtml(iniziali)}</span>`;
}

function convertiMinuti(ora) {
    const [h, m] = String(ora).substring(0, 5).split(":").map(Number);
    return h * 60 + m;
}

function minutiToOra(minuti) {
    return String(Math.floor(minuti / 60)).padStart(2, "0") + ":" + String(minuti % 60).padStart(2, "0");
}

function normalizzaData(data) {
    if (!data) return "";
    const testo = String(data);
    if (/^\d{4}-\d{2}-\d{2}$/.test(testo)) return testo;
    // Date di Sheets serializzate (ISO UTC o "Wed Nov 25 2026 ..."): converti in giorno locale
    const d = new Date(testo);
    return isNaN(d) ? testo.substring(0, 10) : isoDa(d);
}

function normalizzaOra(ora) {
    return ora ? String(ora).substring(0, 5) : "";
}

function isoDa(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function oggiIso() {
    return isoDa(new Date());
}

function inizioMese(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function dataLocale(data) {
    const [a, m, g] = String(data).split("-").map(Number);
    return new Date(a, m - 1, g);
}

function formattaData(data) {
    return dataLocale(data).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

function mostraMessaggio(html, tipo) {
    message.className = tipo;
    message.innerHTML = html;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
