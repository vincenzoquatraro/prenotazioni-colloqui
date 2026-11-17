// =====================================================
// PRENOTAZIONE COLLOQUI — Backend Google Apps Script
//
// Fogli richiesti (prima riga = intestazioni, l'ordine delle colonne non conta):
//   Docenti:       id | nome | email (facoltativa: invito Calendar)
//   Disponibilita: id | docente_id | data | ora_inizio | ora_fine
//   Prenotazioni:  id | docente_id | data | ora_inizio | ora_fine | genitore | alunno | classe | timestamp | event_id (facoltativa)
//
// Proprietà script (Impostazioni progetto > Proprietà script):
//   ADMIN_CODE   codice di accesso al pannello (obbligatorio)
//   CALENDAR_ID  ID del Google Calendar dove creare gli eventi (facoltativo)
// =====================================================

const FOGLIO_DOCENTI = "Docenti";
const FOGLIO_DISPONIBILITA = "Disponibilita";
const FOGLIO_PRENOTAZIONI = "Prenotazioni";

const DURATA_SLOT = 15;
const BLOCCO = "[INDISPONIBILE]"; // genitore fittizio per gli slot chiusi dall'admin

// =====================================================
// ENTRY POINT
// =====================================================

function doGet() {
  try {
    return json({
      success: true,
      docenti: leggi(FOGLIO_DOCENTI).map(d => ({ id: d.id, nome: d.nome })),
      disponibilita: leggi(FOGLIO_DISPONIBILITA),
      // al pubblico solo gli slot occupati, nessun dato personale
      prenotazioni: leggi(FOGLIO_PRENOTAZIONI).map(p => ({
        docente_id: p.docente_id,
        data: p.data,
        ora_inizio: p.ora_inizio
      }))
    });
  } catch (err) {
    return json({ success: false, message: String(err.message || err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse(e.postData.contents);
    lock.waitLock(15000);

    if (!body.action) {
      if (body.genitore === BLOCCO) return json({ success: false, message: "Nome non valido." });
      return json(prenota(body)); // retrocompatibile con app.js
    }

    if (!codiceValido(body.codice)) {
      Utilities.sleep(1500); // rallenta tentativi a forza bruta
      return json({ success: false, message: "Codice di accesso non valido." });
    }

    switch (body.action) {
      case "admin_login":
        return json({ success: true });
      case "admin_dati":
        return json({
          success: true,
          docenti: leggi(FOGLIO_DOCENTI),
          disponibilita: leggi(FOGLIO_DISPONIBILITA),
          prenotazioni: leggi(FOGLIO_PRENOTAZIONI)
        });
      case "aggiungi_docente":
        return json(aggiungiDocente(body));
      case "elimina_docente":
        return json(eliminaDocente(body));
      case "aggiungi_disponibilita":
        return json(aggiungiDisponibilita(body));
      case "elimina_disponibilita":
        return json(eliminaDove(FOGLIO_DISPONIBILITA, r => stesseChiavi(r, body, ["docente_id", "data", "ora_inizio", "ora_fine"]))
          ? { success: true } : nonTrovato());
      case "blocca_slot":
        return json(prenota({ ...body, genitore: BLOCCO, alunno: "-", classe: "-" }));
      case "annulla_prenotazione":
        return json(annullaPrenotazione(body));
      default:
        return json({ success: false, message: "Azione sconosciuta." });
    }
  } catch (err) {
    return json({ success: false, message: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

// =====================================================
// PRENOTAZIONI
// =====================================================

function prenota(b) {
  const campi = ["docente_id", "data", "ora_inizio", "ora_fine", "genitore", "alunno", "classe"];
  for (const c of campi) {
    if (!String(b[c] || "").trim()) return { success: false, message: "Dati mancanti: " + c };
  }

  if (!slotDisponibile(b.docente_id, b.data, b.ora_inizio)) {
    return { success: false, message: "Orario non disponibile." };
  }

  const occupato = leggi(FOGLIO_PRENOTAZIONI).some(p =>
    String(p.docente_id) === String(b.docente_id) && p.data === b.data && p.ora_inizio === b.ora_inizio
  );
  if (occupato) {
    return { success: false, message: "Questo orario è appena stato prenotato da un altro genitore. Scegline un altro." };
  }

  const riga = {
    docente_id: b.docente_id,
    data: b.data,
    ora_inizio: b.ora_inizio,
    ora_fine: b.ora_fine,
    genitore: b.genitore === BLOCCO ? BLOCCO : pulisci(b.genitore),
    alunno: pulisci(b.alunno),
    classe: pulisci(b.classe),
    timestamp: new Date()
  };
  if (riga.genitore !== BLOCCO) riga.event_id = creaEvento(riga);

  aggiungi(FOGLIO_PRENOTAZIONI, riga);
  return { success: true };
}

function slotDisponibile(docenteId, data, oraInizio) {
  const t = minuti(oraInizio);
  return leggi(FOGLIO_DISPONIBILITA).some(d =>
    String(d.docente_id) === String(docenteId) &&
    d.data === data &&
    t >= minuti(d.ora_inizio) &&
    t + DURATA_SLOT <= minuti(d.ora_fine)
  );
}

function annullaPrenotazione(b) {
  const p = leggi(FOGLIO_PRENOTAZIONI).find(r => stesseChiavi(r, b, ["docente_id", "data", "ora_inizio"]));
  if (!p) return nonTrovato();
  eliminaEvento(p.event_id);
  foglio(FOGLIO_PRENOTAZIONI).deleteRow(p._riga);
  return { success: true };
}

// =====================================================
// ADMIN
// =====================================================

function codiceValido(codice) {
  const atteso = PropertiesService.getScriptProperties().getProperty("ADMIN_CODE");
  return Boolean(atteso) && String(codice || "") === atteso;
}

function aggiungiDocente(b) {
  const nome = pulisci(b.nome || "");
  if (!nome) return { success: false, message: "Inserisci il nome del docente." };
  const email = String(b.email || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: "Email non valida." };
  aggiungi(FOGLIO_DOCENTI, { nome, email });
  return { success: true };
}

// Elimina il docente e le sue fasce; rifiuta se ha prenotazioni
function eliminaDocente(b) {
  const id = String(b.id);
  if (leggi(FOGLIO_PRENOTAZIONI).some(p => String(p.docente_id) === id)) {
    return { success: false, message: "Il docente ha prenotazioni o slot chiusi: annullali prima." };
  }
  eliminaDove(FOGLIO_DISPONIBILITA, r => String(r.docente_id) === id);
  return eliminaDove(FOGLIO_DOCENTI, r => String(r.id) === id) ? { success: true } : nonTrovato();
}

function aggiungiDisponibilita(b) {
  if (!b.docente_id || !/^\d{4}-\d{2}-\d{2}$/.test(b.data || "") ||
      !/^\d{2}:\d{2}$/.test(b.ora_inizio || "") || !/^\d{2}:\d{2}$/.test(b.ora_fine || "")) {
    return { success: false, message: "Dati non validi." };
  }
  if (minuti(b.ora_fine) - minuti(b.ora_inizio) < DURATA_SLOT) {
    return { success: false, message: "La fascia deve durare almeno 15 minuti." };
  }
  if (!leggi(FOGLIO_DOCENTI).some(d => String(d.id) === String(b.docente_id))) {
    return { success: false, message: "Docente inesistente." };
  }
  const sovrapposta = leggi(FOGLIO_DISPONIBILITA).some(d =>
    String(d.docente_id) === String(b.docente_id) && d.data === b.data &&
    minuti(b.ora_inizio) < minuti(d.ora_fine) && minuti(d.ora_inizio) < minuti(b.ora_fine)
  );
  if (sovrapposta) return { success: false, message: "La fascia si sovrappone a una già esistente." };

  aggiungi(FOGLIO_DISPONIBILITA, {
    docente_id: b.docente_id,
    data: b.data,
    ora_inizio: b.ora_inizio,
    ora_fine: b.ora_fine
  });
  return { success: true };
}

// =====================================================
// GOOGLE CALENDAR (attivo solo se è impostata CALENDAR_ID)
// =====================================================

function calendario() {
  const id = PropertiesService.getScriptProperties().getProperty("CALENDAR_ID");
  return id ? CalendarApp.getCalendarById(id) : null;
}

function creaEvento(p) {
  try {
    const cal = calendario();
    if (!cal) return "";
    const doc = leggi(FOGLIO_DOCENTI).find(d => String(d.id) === String(p.docente_id)) || {};
    const ev = cal.createEvent(
      `Colloquio ${doc.nome || ""} – ${p.alunno} (${p.classe})`,
      dataOra(p.data, p.ora_inizio),
      dataOra(p.data, p.ora_fine),
      {
        description: `Genitore: ${p.genitore}\nAlunno: ${p.alunno}\nClasse: ${p.classe}`,
        guests: doc.email || "",
        sendInvites: Boolean(doc.email)
      }
    );
    return ev.getId();
  } catch (err) {
    console.error("Calendar:", err); // la prenotazione resta valida anche se Calendar fallisce
    return "";
  }
}

function eliminaEvento(eventId) {
  try {
    const cal = calendario();
    const ev = cal && eventId ? cal.getEventById(eventId) : null;
    if (ev) ev.deleteEvent();
  } catch (err) {
    console.error("Calendar:", err);
  }
}

function dataOra(data, ora) {
  const [a, m, g] = data.split("-").map(Number);
  const [h, mi] = ora.split(":").map(Number);
  return new Date(a, m - 1, g, h, mi); // fuso orario dello script
}

// Esegui una volta dall'editor per autorizzare l'accesso a Calendar
function autorizzaCalendar() {
  console.log(calendario() ? "Calendario trovato: " + calendario().getName() : "CALENDAR_ID non impostato");
}

// =====================================================
// UTILITÀ FOGLI
// =====================================================

function foglio(nome) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sheet) throw new Error("Foglio mancante: " + nome);
  return sheet;
}

function isData(v) {
  return Object.prototype.toString.call(v) === "[object Date]";
}

// Righe come oggetti {intestazione: valore} + _riga (numero di riga reale nel foglio).
// Date "yyyy-MM-dd", ore "HH:mm".
function leggi(nome) {
  const valori = foglio(nome).getDataRange().getValues();
  const intestazioni = valori.shift().map(h => String(h).trim().toLowerCase());
  const tz = Session.getScriptTimeZone();

  return valori
    .map((r, i) => {
      if (!r.some(v => v !== "")) return null;
      const obj = { _riga: i + 2 };
      intestazioni.forEach((h, j) => {
        let v = r[j];
        if (isData(v)) {
          // Sheets rappresenta le sole ore come date del 1899
          v = Utilities.formatDate(v, tz, v.getFullYear() < 1900 ? "HH:mm" : "yyyy-MM-dd");
        } else if (h === "data" && v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())) {
          // date salvate come testo, es. "Thu Nov 26 2026 00:00:00 GMT+0100"
          const d = new Date(String(v));
          if (!isNaN(d)) v = Utilities.formatDate(d, tz, "yyyy-MM-dd");
        }
        obj[h] = String(v).trim();
      });
      if (obj.ora_inizio) obj.ora_inizio = obj.ora_inizio.substring(0, 5).padStart(5, "0");
      if (obj.ora_fine) obj.ora_fine = obj.ora_fine.substring(0, 5).padStart(5, "0");
      return obj;
    })
    .filter(Boolean);
}

function aggiungi(nome, obj) {
  const sheet = foglio(nome);
  const intestazioni = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h).trim().toLowerCase());
  // colonna "id" presente: progressivo max+1
  if (intestazioni.includes("id") && !("id" in obj)) {
    obj.id = leggi(nome).reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
  }
  const riga = intestazioni.map(h => (h in obj ? obj[h] : ""));
  sheet.appendRow(riga);
  // forza testo per data/ora così Sheets non le converte
  const r = sheet.getLastRow();
  intestazioni.forEach((h, i) => {
    if (["data", "ora_inizio", "ora_fine"].includes(h)) {
      sheet.getRange(r, i + 1).setNumberFormat("@").setValue(obj[h]);
    }
  });
}

// Elimina tutte le righe che soddisfano cond (dal basso, così i numeri di riga restano validi)
function eliminaDove(nome, cond) {
  const sheet = foglio(nome);
  const righe = leggi(nome).filter(cond).reverse();
  righe.forEach(r => sheet.deleteRow(r._riga));
  return righe.length;
}

function stesseChiavi(r, b, chiavi) {
  return chiavi.every(k => String(r[k]) === String(b[k]));
}

function nonTrovato() {
  return { success: false, message: "Elemento non trovato (forse già eliminato)." };
}

function minuti(ora) {
  const [h, m] = String(ora).split(":").map(Number);
  return h * 60 + m;
}

// evita formule iniettate nel foglio
function pulisci(s) {
  s = String(s).trim().substring(0, 100);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
