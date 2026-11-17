// =====================================================
// PRENOTAZIONE COLLOQUI — Backend Google Apps Script
//
// Fogli richiesti (prima riga = intestazioni, l'ordine delle colonne non conta):
//   Docenti:       id | nome
//   Disponibilita: docente_id | data | ora_inizio | ora_fine
//   Prenotazioni:  docente_id | data | ora_inizio | ora_fine | genitore | alunno | classe | timestamp
//
// Codice admin: Impostazioni progetto > Proprietà script > ADMIN_CODE
// =====================================================

const FOGLIO_DOCENTI = "Docenti";
const FOGLIO_DISPONIBILITA = "Disponibilita";
const FOGLIO_PRENOTAZIONI = "Prenotazioni";

// =====================================================
// ENTRY POINT
// =====================================================

function doGet() {
  try {
    return json({
      success: true,
      docenti: leggi(FOGLIO_DOCENTI),
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

    if (!body.action) return json(prenota(body)); // retrocompatibile con app.js

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
      case "aggiungi_disponibilita":
        return json(aggiungiDisponibilita(body));
      case "elimina_disponibilita":
        return json(eliminaRiga(FOGLIO_DISPONIBILITA, body, ["docente_id", "data", "ora_inizio", "ora_fine"]));
      case "annulla_prenotazione":
        return json(eliminaRiga(FOGLIO_PRENOTAZIONI, body, ["docente_id", "data", "ora_inizio"]));
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
// PRENOTAZIONE PUBBLICA
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

  aggiungi(FOGLIO_PRENOTAZIONI, {
    docente_id: b.docente_id,
    data: b.data,
    ora_inizio: b.ora_inizio,
    ora_fine: b.ora_fine,
    genitore: pulisci(b.genitore),
    alunno: pulisci(b.alunno),
    classe: pulisci(b.classe),
    timestamp: new Date()
  });

  return { success: true };
}

function slotDisponibile(docenteId, data, oraInizio) {
  const t = minuti(oraInizio);
  return leggi(FOGLIO_DISPONIBILITA).some(d =>
    String(d.docente_id) === String(docenteId) &&
    d.data === data &&
    t >= minuti(d.ora_inizio) &&
    t + 15 <= minuti(d.ora_fine)
  );
}

// =====================================================
// ADMIN
// =====================================================

function codiceValido(codice) {
  const atteso = PropertiesService.getScriptProperties().getProperty("ADMIN_CODE");
  return Boolean(atteso) && String(codice || "") === atteso;
}

function aggiungiDisponibilita(b) {
  if (!b.docente_id || !/^\d{4}-\d{2}-\d{2}$/.test(b.data || "") ||
      !/^\d{2}:\d{2}$/.test(b.ora_inizio || "") || !/^\d{2}:\d{2}$/.test(b.ora_fine || "")) {
    return { success: false, message: "Dati non validi." };
  }
  if (minuti(b.ora_fine) - minuti(b.ora_inizio) < 15) {
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

// Elimina la prima riga i cui campi chiave coincidono con quelli inviati
function eliminaRiga(nomeFoglio, b, chiavi) {
  const sheet = foglio(nomeFoglio);
  const righe = leggi(nomeFoglio);
  const i = righe.findIndex(r => chiavi.every(k => String(r[k]) === String(b[k])));
  if (i < 0) return { success: false, message: "Elemento non trovato (forse già eliminato)." };
  sheet.deleteRow(i + 2); // +1 intestazione, +1 base 1
  return { success: true };
}

// =====================================================
// UTILITÀ FOGLI
// =====================================================

function foglio(nome) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!sheet) throw new Error("Foglio mancante: " + nome);
  return sheet;
}

// Restituisce le righe come oggetti {intestazione: valore}, date "yyyy-MM-dd" e ore "HH:mm"
function leggi(nome) {
  const valori = foglio(nome).getDataRange().getValues();
  const intestazioni = valori.shift().map(h => String(h).trim().toLowerCase());
  const tz = Session.getScriptTimeZone();

  return valori
    .filter(r => r.some(v => v !== ""))
    .map(r => {
      const obj = {};
      intestazioni.forEach((h, i) => {
        let v = r[i];
        if (v instanceof Date) {
          // Sheets rappresenta le sole ore come date del 1899
          v = Utilities.formatDate(v, tz, v.getFullYear() < 1900 ? "HH:mm" : "yyyy-MM-dd");
        }
        obj[h] = h === "timestamp" ? v : String(v).trim();
      });
      if (obj.ora_inizio) obj.ora_inizio = obj.ora_inizio.substring(0, 5).padStart(5, "0");
      if (obj.ora_fine) obj.ora_fine = obj.ora_fine.substring(0, 5).padStart(5, "0");
      return obj;
    });
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
