// =====================================================
// CONFIGURAZIONE
// =====================================================

const API_URL =
    "https://script.google.com/macros/s/AKfycbyO2DIsz-KfmiQDuwRK_vp-80McO5Ohtm9usOv1FRCWVGjloTL0K27j0yI992z1F_QM/exec";

// =====================================================
// ELEMENTI HTML
// =====================================================

const docenteSelect = document.getElementById("docente");
const dataSelect = document.getElementById("data");
const slotContainer = document.getElementById("slot-container");
const datiCard = document.getElementById("dati-card");

const genitoreInput = document.getElementById("genitore");
const alunnoInput = document.getElementById("alunno");
const classeInput = document.getElementById("classe");

const prenotaBtn = document.getElementById("prenota-btn");
const message = document.getElementById("message");


// =====================================================
// STATO
// =====================================================

let docenti = [];
let disponibilita = [];
let prenotazioni = [];

let slotSelezionato = null;


// =====================================================
// AVVIO
// =====================================================

document.addEventListener("DOMContentLoaded", caricaDati);


// =====================================================
// CARICAMENTO DATI DA GOOGLE APPS SCRIPT
// =====================================================

async function caricaDati() {

    try {

        message.innerHTML = "";
        docenteSelect.innerHTML = `
            <option value="">Caricamento...</option>
        `;

        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(
                `Errore HTTP ${response.status}`
            );
        }

        const data = await response.json();

        console.log("Dati ricevuti da Apps Script:", data);

        if (!data.success) {
            throw new Error(
                data.message || "Errore Apps Script"
            );
        }

        docenti = data.docenti || [];
        disponibilita = data.disponibilita || [];
        prenotazioni = data.prenotazioni || [];

        popolaDocenti();

    } catch (error) {

        console.error(
            "Errore caricamento:",
            error
        );

        docenteSelect.innerHTML = `
            <option value="">
                Errore caricamento
            </option>
        `;

        mostraMessaggio(
            "Non riesco a collegarmi al sistema di prenotazione.",
            "error"
        );
    }
}


// =====================================================
// POPOLA DOCENTI
// =====================================================

function popolaDocenti() {

    docenteSelect.innerHTML = `
        <option value="">
            Seleziona un docente
        </option>
    `;

    docenti.forEach(function(docente) {

        const option =
            document.createElement("option");

        option.value =
            docente.id;

        option.textContent =
            docente.nome;

        docenteSelect.appendChild(option);
    });
}


// =====================================================
// CAMBIO DOCENTE
// =====================================================

docenteSelect.addEventListener("change", function() {

    slotSelezionato = null;

    datiCard.classList.add("hidden");

    dataSelect.innerHTML = `
        <option value="">
            Seleziona una data
        </option>
    `;

    dataSelect.disabled = true;

    slotContainer.innerHTML = `
        <div class="empty">
            Scegli una data
        </div>
    `;

    const docenteId =
        docenteSelect.value;

    if (!docenteId) {
        return;
    }

    const date = disponibilita
        .filter(function(item) {

            return String(item.docente_id) ===
                   String(docenteId);

        })
        .map(function(item) {

            return normalizzaData(item.data);

        });

    const dateUniche =
        [...new Set(date)];

    dateUniche.sort();

    dateUniche.forEach(function(data) {

        const option =
            document.createElement("option");

        option.value =
            data;

        option.textContent =
            formattaData(data);

        dataSelect.appendChild(option);
    });

    dataSelect.disabled =
        dateUniche.length === 0;
});


// =====================================================
// CAMBIO DATA
// =====================================================

dataSelect.addEventListener(
    "change",
    mostraSlot
);


// =====================================================
// MOSTRA SLOT
// =====================================================

function mostraSlot() {

    slotSelezionato = null;

    datiCard.classList.add("hidden");

    slotContainer.innerHTML = "";

    const docenteId =
        docenteSelect.value;

    const data =
        dataSelect.value;

    if (!docenteId || !data) {

        slotContainer.innerHTML = `
            <div class="empty">
                Scegli docente e data
            </div>
        `;

        return;
    }


    const fasce =
        disponibilita.filter(function(item) {

            return (
                String(item.docente_id) ===
                    String(docenteId)
                &&
                normalizzaData(item.data) ===
                    data
            );

        });


    const slots = [];


    fasce.forEach(function(fascia) {

        let corrente =
            convertiMinuti(
                fascia.ora_inizio
            );

        const fine =
            convertiMinuti(
                fascia.ora_fine
            );


        while (corrente < fine) {

            const oraInizio =
                minutiToOra(corrente);

            const oraFine =
                minutiToOra(corrente + 15);

            slots.push({

                data: data,

                ora_inizio:
                    oraInizio,

                ora_fine:
                    oraFine

            });

            corrente += 15;
        }
    });


    if (slots.length === 0) {

        slotContainer.innerHTML = `
            <div class="empty">
                Nessun appuntamento disponibile.
            </div>
        `;

        return;
    }


    slots.forEach(function(slot) {

        const button =
            document.createElement("button");

        button.type =
            "button";

        button.className =
            "slot";

        button.textContent =
            `${slot.ora_inizio} – ${slot.ora_fine}`;


        const giaPrenotato =
            prenotazioni.some(function(p) {

                return (
                    String(p.docente_id) ===
                        String(docenteId)
                    &&
                    normalizzaData(p.data) ===
                        data
                    &&
                    normalizzaOra(p.ora_inizio) ===
                        slot.ora_inizio
                );

            });


        if (giaPrenotato) {

            button.classList.add("booked");

            button.disabled = true;

        } else {

            button.addEventListener(
                "click",
                function() {

                    selezionaSlot(
                        button,
                        slot
                    );

                }
            );
        }


        slotContainer.appendChild(button);
    });
}


// =====================================================
// SELEZIONA SLOT
// =====================================================

function selezionaSlot(button, slot) {

    document
        .querySelectorAll(".slot.selected")
        .forEach(function(element) {

            element.classList.remove(
                "selected"
            );

        });


    button.classList.add("selected");

    slotSelezionato =
        slot;

    datiCard.classList.remove("hidden");

    datiCard.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}


// =====================================================
// PRENOTA
// =====================================================

prenotaBtn.addEventListener(
    "click",
    prenota
);


async function prenota() {

    if (!slotSelezionato) {

        mostraMessaggio(
            "Seleziona prima un orario.",
            "error"
        );

        return;
    }


    const genitore =
        genitoreInput.value.trim();

    const alunno =
        alunnoInput.value.trim();

    const classe =
        classeInput.value.trim();


    if (
        !genitore ||
        !alunno ||
        !classe
    ) {

        mostraMessaggio(
            "Compila tutti i campi.",
            "error"
        );

        return;
    }


    prenotaBtn.disabled = true;

    prenotaBtn.textContent =
        "Prenotazione in corso...";


    try {

        const response =
            await fetch(API_URL, {

                method: "POST",

                body: JSON.stringify({

                    docente_id:
                        docenteSelect.value,

                    data:
                        slotSelezionato.data,

                    ora_inizio:
                        slotSelezionato.ora_inizio,

                    ora_fine:
                        slotSelezionato.ora_fine,

                    genitore:
                        genitore,

                    alunno:
                        alunno,

                    classe:
                        classe

                })

            });


        const result =
            await response.json();


        if (!result.success) {

            mostraMessaggio(
                result.message,
                "error"
            );

            await caricaDati();

            return;
        }


        const docente =
            docenti.find(function(item) {

                return String(item.id) ===
                       String(docenteSelect.value);

            });


        mostraMessaggio(

            `
            <strong>✓ Prenotazione confermata</strong>

            <br><br>

            ${escapeHtml(docente.nome)}

            <br>

            ${formattaData(
                slotSelezionato.data
            )}

            <br>

            ${slotSelezionato.ora_inizio}
            –
            ${slotSelezionato.ora_fine}

            <br><br>

            Alunno:
            ${escapeHtml(alunno)}
            `,

            "success"

        );


        datiCard.classList.add(
            "hidden"
        );

        slotSelezionato = null;

        genitoreInput.value = "";
        alunnoInput.value = "";
        classeInput.value = "";

        await caricaDati();

    }

    catch (error) {

        console.error(
            "Errore prenotazione:",
            error
        );

        mostraMessaggio(
            "Si è verificato un errore durante la prenotazione.",
            "error"
        );

    }

    finally {

        prenotaBtn.disabled =
            false;

        prenotaBtn.textContent =
            "Conferma prenotazione";

    }
}


// =====================================================
// UTILITÀ
// =====================================================

function convertiMinuti(ora) {

    const parti =
        String(ora)
            .substring(0, 5)
            .split(":");

    const ore =
        Number(parti[0]);

    const minuti =
        Number(parti[1]);

    return ore * 60 + minuti;
}


function minutiToOra(minuti) {

    const ore =
        Math.floor(minuti / 60);

    const minutiRimanenti =
        minuti % 60;

    return (
        String(ore).padStart(2, "0")
        +
        ":"
        +
        String(minutiRimanenti)
            .padStart(2, "0")
    );
}


function normalizzaData(data) {

    if (!data) {
        return "";
    }

    const testo =
        String(data);

    // Se è già yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(testo)) {
        return testo;
    }

    return testo.substring(0, 10);
}


function normalizzaOra(ora) {

    if (!ora) {
        return "";
    }

    return String(ora).substring(0, 5);
}


function formattaData(data) {

    const parti =
        String(data).split("-");

    if (parti.length !== 3) {
        return data;
    }

    const anno =
        Number(parti[0]);

    const mese =
        Number(parti[1]);

    const giorno =
        Number(parti[2]);


    const date =
        new Date(
            anno,
            mese - 1,
            giorno
        );


    return date.toLocaleDateString(
        "it-IT",
        {
            weekday: "long",
            day: "numeric",
            month: "long"
        }
    );
}


function mostraMessaggio(
    testo,
    tipo
) {

    message.className =
        tipo;

    message.innerHTML =
        testo;
}


function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent =
        text;

    return div.innerHTML;
}
