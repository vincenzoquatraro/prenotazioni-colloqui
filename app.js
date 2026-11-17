```javascript
// =====================================================
// CONFIGURAZIONE
// =====================================================

const API_URL =
    "https://script.google.com/macros/s/AKfycbyO2DIsz-KfmiQDuwRK_vp-80McO5Ohtm9usOv1FRCWVGjloTL0K27j0yI992z1F_QM/exec";


// =====================================================
// ELEMENTI HTML
// =====================================================

const docenteSelect =
    document.getElementById("docente");

const dataSelect =
    document.getElementById("data");

const slotContainer =
    document.getElementById("slot-container");

const datiCard =
    document.getElementById("dati-card");

const genitoreInput =
    document.getElementById("genitore");

const alunnoInput =
    document.getElementById("alunno");

const classeInput =
    document.getElementById("classe");

const prenotaBtn =
    document.getElementById("prenota-btn");

const message =
    document.getElementById("message");


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

document.addEventListener(
    "DOMContentLoaded",
    caricaDati
);


// =====================================================
// CARICA I DATI
// =====================================================

async function caricaDati() {

    try {

        mostraMessaggio(
            "Caricamento...",
            "success"
        );

        const response =
            await fetch(API_URL);

        const data =
            await response.json();

        if (!data.success) {
            throw new Error(data.message);
        }

        docenti =
            data.docenti;

        disponibilita =
            data.disponibilita;

        prenotazioni =
            data.prenotazioni;

        popolaDocenti();

        message.innerHTML = "";

    }

    catch (error) {

        console.error(error);

        mostraMessaggio(
            "Non riesco a collegarmi al sistema di prenotazione.",
            "error"
        );

    }

}


// =====================================================
// DOCENTI
// =====================================================

function popolaDocenti() {

    docenteSelect.innerHTML = `
        <option value="">
            Seleziona un docente
        </option>
    `;

    docenti.forEach(docente => {

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

docenteSelect.addEventListener(
    "change",
    () => {

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

        const date =
            disponibilita
                .filter(x =>
                    String(x.docente_id) ===
                    String(docenteId)
                )
                .map(x => x.data);

        const dateUniche =
            [...new Set(date)];

        dateUniche.sort();

        dateUniche.forEach(data => {

            const option =
                document.createElement("option");

            option.value = data;

            option.textContent =
                formattaData(data);

            dataSelect.appendChild(option);

        });

        dataSelect.disabled =
            dateUniche.length === 0;

    }
);


// =====================================================
// CAMBIO DATA
// =====================================================

dataSelect.addEventListener(
    "change",
    mostraSlot
);


// =====================================================
// GENERAZIONE SLOT
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


    const disponibilitaDocente =
        disponibilita.filter(x =>
            String(x.docente_id) ===
                String(docenteId)
            &&
            x.data === data
        );


    const slot = [];


    disponibilitaDocente.forEach(fascia => {

        let current =
            convertiMinuti(fascia.ora_inizio);

        const fine =
            convertiMinuti(fascia.ora_fine);


        while (current < fine) {

            const start =
                minutiToOra(current);

            const end =
                minutiToOra(current + 15);

            slot.push({
                data: data,
                ora_inizio: start,
                ora_fine: end
            });

            current += 15;

        }

    });


    if (slot.length === 0) {

        slotContainer.innerHTML = `
            <div class="empty">
                Nessun appuntamento disponibile.
            </div>
        `;

        return;
    }


    slot.forEach(s => {

        const button =
            document.createElement("button");

        button.type = "button";

        button.className = "slot";

        button.textContent =
            `${s.ora_inizio} – ${s.ora_fine}`;


        const prenotato =
            prenotazioni.some(p =>
                String(p.docente_id) ===
                    String(docenteId)
                &&
                p.data === data
                &&
                p.ora_inizio ===
                    s.ora_inizio
            );


        if (prenotato) {

            button.classList.add("booked");

            button.disabled = true;

        }

        else {

            button.addEventListener(
                "click",
                () => selezionaSlot(button, s)
            );

        }


        slotContainer.appendChild(button);

    });

}


// =====================================================
// SELEZIONE SLOT
// =====================================================

function selezionaSlot(button, slot) {

    document
        .querySelectorAll(".slot.selected")
        .forEach(x =>
            x.classList.remove("selected")
        );

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
// PRENOTAZIONE
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


    if (!genitore ||
        !alunno ||
        !classe) {

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
            docenti.find(x =>
                String(x.id) ===
                String(docenteSelect.value)
            );


        mostraMessaggio(`
            <strong>✓ Prenotazione confermata</strong>
            <br><br>
            ${escapeHtml(docente.nome)}
            <br>
            ${formattaData(slotSelezionato.data)}
            <br>
            ${slotSelezionato.ora_inizio}
            –
            ${slotSelezionato.ora_fine}
            <br><br>
            Alunno:
            ${escapeHtml(alunno)}
        `, "success");


        datiCard.classList.add("hidden");

        slotSelezionato = null;

        genitoreInput.value = "";
        alunnoInput.value = "";
        classeInput.value = "";

        await caricaDati();

    }

    catch (error) {

        console.error(error);

        mostraMessaggio(
            "Si è verificato un errore durante la prenotazione.",
            "error"
        );

    }

    finally {

        prenotaBtn.disabled = false;

        prenotaBtn.textContent =
            "Conferma prenotazione";

    }

}


// =====================================================
// UTILITÀ
// =====================================================

function convertiMinuti(ora) {

    const [h, m] =
        ora.split(":").map(Number);

    return h * 60 + m;

}


function minutiToOra(minuti) {

    const h =
        Math.floor(minuti / 60);

    const m =
        minuti % 60;

    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

}


function formattaData(data) {

    const [anno, mese, giorno] =
        data.split("-").map(Number);

    const d =
        new Date(anno, mese - 1, giorno);

    return d.toLocaleDateString(
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

    message.className = tipo;

    message.innerHTML = testo;

}


function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent =
        text;

    return div.innerHTML;

}
```
