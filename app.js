// =====================================================
// CONFIGURAZIONE
// =====================================================

const API_URL =
    "https://script.google.com/macros/s/AKfycbyO2DIsz-KfmiQDuwRK_vp-80McO5Ohtm9usOv1FRCWVGjloTL0K27j0yI992z1F_QM/exec";

const DURATA_SLOT = 15;

// =====================================================
// ELEMENTI E STATO
// =====================================================

const docenteSelect = document.getElementById("docente");
const dateContainer = document.getElementById("date-container");
const slotContainer = document.getElementById("slot-container");
const datiCard = document.getElementById("dati-card");
const riepilogo = document.getElementById("riepilogo");
const genitoreInput = document.getElementById("genitore");
const alunnoInput = document.getElementById("alunno");
const classeInput = document.getElementById("classe");
const prenotaBtn = document.getElementById("prenota-btn");
const message = document.getElementById("message");

let docenti = [];
let disponibilita = [];
let prenotazioni = [];

let dataSelezionata = "";
let slotSelezionato = null;

document.addEventListener("DOMContentLoaded", caricaDati);
docenteSelect.addEventListener("change", mostraDate);
prenotaBtn.addEventListener("click", prenota);

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

        popolaDocenti();
    } catch (error) {
        console.error("Errore caricamento:", error);
        docenteSelect.innerHTML = `<option value="">Errore caricamento</option>`;
        mostraMessaggio("Non riesco a collegarmi al sistema di prenotazione. Riprova tra poco.", "error");
    }
}

function popolaDocenti() {
    const selezionato = docenteSelect.value;

    docenteSelect.innerHTML = `<option value="">Seleziona un docente</option>`;
    docenti.forEach(function(docente) {
        docenteSelect.appendChild(new Option(docente.nome, docente.id));
    });

    // dopo un ricaricamento mantiene la scelta corrente
    if (selezionato) {
        docenteSelect.value = selezionato;
        mostraDate(false);
    }
}

// =====================================================
// DATE
// =====================================================

function mostraDate(reset = true) {
    if (reset !== false) {
        dataSelezionata = "";
        message.innerHTML = "";
        message.className = "";
    }
    nascondiDati();

    const docenteId = docenteSelect.value;
    if (!docenteId) {
        dateContainer.innerHTML = `<div class="empty">Prima scegli un docente</div>`;
        slotContainer.innerHTML = `<div class="empty">Scegli docente e giorno</div>`;
        return;
    }

    const oggi = oggiIso();
    const date = [...new Set(
        disponibilita
            .filter(d => String(d.docente_id) === String(docenteId))
            .map(d => normalizzaData(d.data))
            .filter(d => d >= oggi)
    )].sort();

    dateContainer.innerHTML = "";

    if (date.length === 0) {
        dateContainer.innerHTML = `<div class="empty">Nessun giorno disponibile per questo docente</div>`;
        slotContainer.innerHTML = `<div class="empty">—</div>`;
        return;
    }

    date.forEach(function(data) {
        const [giorno, resto] = etichettaData(data);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip" + (data === dataSelezionata ? " selected" : "");
        chip.innerHTML = `${resto}<small>${giorno}</small>`;
        chip.setAttribute("aria-pressed", data === dataSelezionata);
        chip.addEventListener("click", function() {
            dataSelezionata = data;
            dateContainer.querySelectorAll(".chip").forEach(c => {
                c.classList.toggle("selected", c === chip);
                c.setAttribute("aria-pressed", c === chip);
            });
            mostraSlot();
        });
        dateContainer.appendChild(chip);
    });

    if (dataSelezionata && date.includes(dataSelezionata)) {
        mostraSlot();
    } else {
        dataSelezionata = "";
        slotContainer.innerHTML = `<div class="empty">Scegli un giorno</div>`;
    }
}

// =====================================================
// SLOT
// =====================================================

function mostraSlot() {
    nascondiDati();
    slotContainer.innerHTML = "";

    const docenteId = docenteSelect.value;
    const data = dataSelezionata;

    const slots = [];
    disponibilita
        .filter(d => String(d.docente_id) === String(docenteId) && normalizzaData(d.data) === data)
        .forEach(function(fascia) {
            const fine = convertiMinuti(fascia.ora_fine);
            for (let t = convertiMinuti(fascia.ora_inizio); t + DURATA_SLOT <= fine; t += DURATA_SLOT) {
                slots.push({ data, ora_inizio: minutiToOra(t), ora_fine: minutiToOra(t + DURATA_SLOT) });
            }
        });

    slots.sort((a, b) => a.ora_inizio.localeCompare(b.ora_inizio));

    if (slots.length === 0) {
        slotContainer.innerHTML = `<div class="empty">Nessun appuntamento disponibile</div>`;
        return;
    }

    slots.forEach(function(slot) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slot";
        button.textContent = `${slot.ora_inizio} – ${slot.ora_fine}`;

        const giaPrenotato = prenotazioni.some(p =>
            String(p.docente_id) === String(docenteId) &&
            normalizzaData(p.data) === data &&
            normalizzaOra(p.ora_inizio) === slot.ora_inizio
        );

        if (giaPrenotato) {
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

    const docente = docenti.find(d => String(d.id) === String(docenteSelect.value));
    riepilogo.textContent =
        `${docente ? docente.nome : ""} · ${formattaData(slot.data)} · ${slot.ora_inizio} – ${slot.ora_fine}`;

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
    const docente = docenti.find(d => String(d.id) === String(docenteSelect.value));

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({
                docente_id: docenteSelect.value,
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
            mostraMessaggio(escapeHtml(result.message || "Prenotazione non riuscita."), "error");
            await caricaDati();
            return;
        }

        genitoreInput.value = "";
        alunnoInput.value = "";
        classeInput.value = "";

        await caricaDati();

        mostraMessaggio(`
            <strong>✓ Prenotazione confermata</strong><br><br>
            ${escapeHtml(docente ? docente.nome : "")}<br>
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
// UTILITÀ
// =====================================================

function convertiMinuti(ora) {
    const [h, m] = String(ora).substring(0, 5).split(":").map(Number);
    return h * 60 + m;
}

function minutiToOra(minuti) {
    return String(Math.floor(minuti / 60)).padStart(2, "0") + ":" + String(minuti % 60).padStart(2, "0");
}

function normalizzaData(data) {
    return data ? String(data).substring(0, 10) : "";
}

function normalizzaOra(ora) {
    return ora ? String(ora).substring(0, 5) : "";
}

function oggiIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataLocale(data) {
    const [a, m, g] = String(data).split("-").map(Number);
    return new Date(a, m - 1, g);
}

function formattaData(data) {
    return dataLocale(data).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

function etichettaData(data) {
    const d = dataLocale(data);
    return [
        d.toLocaleDateString("it-IT", { weekday: "short" }),
        d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
    ];
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
