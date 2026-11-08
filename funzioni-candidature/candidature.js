/**
 * ════════════════════════════════════════════════════════════
 *  NOTIFICA CANDIDATURE — Omnia Adriatic Lifeguard Service
 * ════════════════════════════════════════════════════════════
 *  Si attiva da sola ogni volta che la pagina /candidature
 *  scrive un documento nella collection "candidature".
 *
 *  Cosa fa:
 *    1. manda la mail con tutti i dati a INDIRIZZO_DESTINATARIO
 *    2. manda al candidato una mail di conferma
 *    3. (opzionale) manda un avviso su Telegram
 *
 *  Istruzioni di installazione: vedi LEGGIMI.md
 * ════════════════════════════════════════════════════════════
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret }      = require('firebase-functions/params');
const logger                = require('firebase-functions/logger');
const admin                 = require('firebase-admin');
const nodemailer            = require('nodemailer');

if (!admin.apps.length) admin.initializeApp();

// ── IMPOSTAZIONI ──────────────────────────────────────────
const INDIRIZZO_MITTENTE     = 'omniaturismoroseto@gmail.com'; // account Gmail che invia
const INDIRIZZO_DESTINATARIO = 'omniaturismoroseto@gmail.com'; // dove arrivano le candidature
const INVIA_CONFERMA         = true;   // mail di conferma al candidato
const INVIA_TELEGRAM         = true;   // avviso Telegram (si salta se manca il token)
const REGIONE                = 'europe-west1';

// Password per le app di Google: firebase functions:secrets:set GMAIL_APP_PASSWORD
const GMAIL_APP_PASSWORD  = defineSecret('GMAIL_APP_PASSWORD');
// Token del bot Telegram già usato dal diario (facoltativo)
const TELEGRAM_BOT_TOKEN  = defineSecret('TELEGRAM_BOT_TOKEN');

// ── UTILITÀ ───────────────────────────────────────────────
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const vuoto    = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
const siNo     = (v) => (v ? 'Sì' : 'No');
const elenco   = (v) => (Array.isArray(v) && v.length ? v.join(', ') : '—');
const dataIta  = (iso) => {
  if (!iso) return '—';
  const [a, m, g] = String(iso).split('-');
  return (g && m && a) ? `${g}/${m}/${a}` : iso;
};

/** Numero in formato internazionale per i link wa.me (default Italia). */
function waNumero(tel) {
  let n = String(tel || '').replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('39')) return n;          // già con prefisso internazionale
  n = n.replace(/^0+/, '');                   // toglie lo zero iniziale
  return '39' + n;
}

/** Riga della tabella HTML: salta i campi vuoti. */
function riga(etichetta, valore, evidenzia) {
  if (vuoto(valore)) return '';
  const stile = evidenzia
    ? 'color:#07111f;font-weight:600'
    : 'color:#1a3a5c';
  return `<tr>
    <td style="padding:11px 16px;border-bottom:1px solid #e6eaef;color:#6b7f96;font-size:13px;width:38%;vertical-align:top">${esc(etichetta)}</td>
    <td style="padding:11px 16px;border-bottom:1px solid #e6eaef;font-size:14px;${stile}">${esc(valore)}</td>
  </tr>`;
}

// ── MAIL PER LA SEGRETERIA ────────────────────────────────
function mailInterna(d) {
  const minorenne = typeof d.eta === 'number' && d.eta < 18;

  const corpo = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px 12px;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 12px rgba(7,17,31,.08)">

    <div style="background:#07111f;padding:28px 24px">
      <div style="color:#ff5c1a;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px">Nuova candidatura dal sito</div>
      <div style="color:#ffffff;font-size:24px;font-weight:600">${esc(d.nome)}</div>
      <div style="color:#8fa5be;font-size:14px;margin-top:6px">${esc(d.obiettivo)}</div>
    </div>

    ${minorenne ? `<div style="background:#fff4ed;border-left:4px solid #ff5c1a;padding:13px 20px;color:#7a3c18;font-size:13px">
      <b>Candidato minorenne (${esc(d.eta)} anni)</b> — serve l'autorizzazione del genitore.
    </div>` : ''}

    <table style="width:100%;border-collapse:collapse">
      ${riga('Nome e cognome', d.nome, true)}
      ${riga('Data di nascita', `${dataIta(d.dataNascita)}${d.eta != null ? ` (${d.eta} anni)` : ''}`)}
      ${riga('Telefono', d.telefono, true)}
      ${riga('Email', d.email, true)}
      ${riga('Comune di residenza', d.comune)}
      ${riga('Codice fiscale', d.codiceFiscale)}
      ${riga('Genitore / tutore', d.genitoreNome)}
      ${riga('Telefono genitore', d.genitoreTelefono)}
      ${riga('Si candida per', d.obiettivo, true)}
      ${riga('Brevetto', d.brevettoTipo)}
      ${riga('Scadenza brevetto', d.brevettoScadenza ? dataIta(d.brevettoScadenza) : '')}
      ${riga('Disponibilità', elenco(d.mesi), true)}
      ${riga('Zone preferite', elenco(d.zone))}
      ${riga('Automunito/a', siNo(d.automunito))}
      ${riga('Già assistente bagnanti', siNo(d.esperienzaPrec))}
      ${riga('Come ci ha conosciuti', d.canale)}
    </table>

    ${d.note ? `<div style="padding:18px 20px;background:#f7f9fb;border-top:1px solid #e6eaef">
      <div style="color:#6b7f96;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px">Note del candidato</div>
      <div style="color:#1a3a5c;font-size:14px;line-height:1.65;white-space:pre-wrap">${esc(d.note)}</div>
    </div>` : ''}

    <div style="padding:22px 20px;background:#ffffff;border-top:1px solid #e6eaef;text-align:center">
      <a href="https://wa.me/${waNumero(d.telefono)}"
         style="display:inline-block;background:#ff5c1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 26px;border-radius:3px;margin:4px">
        Rispondi su WhatsApp
      </a>
      <a href="mailto:${esc(d.email)}"
         style="display:inline-block;border:1px solid #c9d3de;color:#1a3a5c;text-decoration:none;font-size:14px;padding:12px 26px;border-radius:3px;margin:4px">
        Rispondi via email
      </a>
    </div>

    <div style="padding:16px 20px;background:#07111f;color:#6b7f96;font-size:11px;text-align:center">
      Candidatura ricevuta dal modulo su adriaticlifeguardservice.it/candidature
    </div>
  </div>
</body></html>`;

  const testo = [
    `NUOVA CANDIDATURA — ${d.nome}`,
    `Si candida per: ${d.obiettivo}`,
    '',
    `Nascita: ${dataIta(d.dataNascita)}${d.eta != null ? ` (${d.eta} anni)` : ''}`,
    `Telefono: ${d.telefono}`,
    `Email: ${d.email}`,
    `Comune: ${d.comune}`,
    d.codiceFiscale ? `Codice fiscale: ${d.codiceFiscale}` : '',
    d.genitoreNome ? `Genitore: ${d.genitoreNome} — ${d.genitoreTelefono}` : '',
    d.brevettoTipo ? `Brevetto: ${d.brevettoTipo}` : '',
    d.brevettoScadenza ? `Scadenza brevetto: ${dataIta(d.brevettoScadenza)}` : '',
    `Disponibilità: ${elenco(d.mesi)}`,
    `Zone: ${elenco(d.zone)}`,
    `Automunito: ${siNo(d.automunito)} — Già assistente bagnanti: ${siNo(d.esperienzaPrec)}`,
    d.canale ? `Ci ha conosciuti da: ${d.canale}` : '',
    d.note ? `\nNote:\n${d.note}` : ''
  ].filter(Boolean).join('\n');

  return {
    subject: `Candidatura assistente bagnanti — ${d.nome} (${d.obiettivo})`,
    html: corpo,
    text: testo
  };
}

// ── MAIL DI CONFERMA AL CANDIDATO ─────────────────────────
function mailConferma(d) {
  const nome = String(d.nome || '').split(' ')[0] || '';
  const corpo = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px 12px;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 12px rgba(7,17,31,.08)">
    <div style="background:#07111f;padding:30px 26px">
      <div style="color:#ff5c1a;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:10px">Omnia Adriatic Lifeguard Service</div>
      <div style="color:#ffffff;font-size:23px;font-weight:600;line-height:1.3">Abbiamo ricevuto<br>la tua candidatura</div>
    </div>
    <div style="padding:28px 26px;color:#1a3a5c;font-size:15px;line-height:1.7">
      <p style="margin:0 0 16px">Ciao ${esc(nome)},</p>
      <p style="margin:0 0 16px">grazie per esserti candidato come <b>assistente bagnanti</b> (mare e piscina). La tua richiesta è arrivata al nostro ufficio: la valutiamo e ti ricontattiamo al numero <b>${esc(d.telefono)}</b> con tutti i dettagli su date, orari e costi del corso.</p>
      <p style="margin:0 0 20px">Se nel frattempo hai domande, puoi scriverci direttamente su WhatsApp.</p>
      <p style="margin:0 0 26px;text-align:center">
        <a href="https://wa.me/393284769641" style="display:inline-block;background:#ff5c1a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 30px;border-radius:3px">Scrivici su WhatsApp</a>
      </p>
      <p style="margin:0;padding-top:18px;border-top:1px solid #e6eaef;color:#6b7f96;font-size:13px">
        Sede del corso: <b style="color:#1a3a5c">Rosetana Nuoto — Piscina Comunale</b>, Roseto degli Abruzzi.<br>
        Info: +39 328 476 9641 · omniaturismoroseto@gmail.com
      </p>
    </div>
    <div style="padding:16px 20px;background:#f7f9fb;color:#8fa5be;font-size:11px;text-align:center;line-height:1.6">
      Omnia Servizi al Turismo S.r.l.s. · P.I. 01900050673 · Costa Adriatica Abruzzese<br>
      Hai ricevuto questa email perché hai compilato il modulo su adriaticlifeguardservice.it
    </div>
  </div>
</body></html>`;

  return {
    subject: 'Abbiamo ricevuto la tua candidatura — Omnia Lifeguard Service',
    html: corpo,
    text: `Ciao ${nome},\n\ngrazie per esserti candidato come assistente bagnanti (mare e piscina).\nLa tua richiesta è arrivata: ti ricontattiamo al ${d.telefono} con date, orari e costi del corso.\n\nInfo e domande: WhatsApp +39 328 476 9641 — omniaturismoroseto@gmail.com\nSede del corso: Rosetana Nuoto, Piscina Comunale, Roseto degli Abruzzi.\n\nOmnia Servizi al Turismo S.r.l.s.`
  };
}

// ── TELEGRAM (facoltativo) ────────────────────────────────
async function avvisaTelegram(d, token) {
  if (!token) { logger.info('Telegram saltato: nessun token configurato.'); return; }
  let chatIds = [];
  try {
    const snap = await admin.firestore().doc('config/telegram_diario').get();
    chatIds = (snap.exists && snap.data().chat_ids) || [];
  } catch (e) {
    logger.warn('Lettura chat_ids Telegram non riuscita:', e.message);
  }
  if (!chatIds.length) { logger.info('Telegram saltato: nessun destinatario.'); return; }

  const testo =
    `🏊 *Nuova candidatura assistente bagnanti*\n\n` +
    `*${d.nome}*${d.eta != null ? ` — ${d.eta} anni` : ''}\n` +
    `${d.obiettivo}\n\n` +
    `📞 ${d.telefono}\n` +
    `✉️ ${d.email}\n` +
    `📍 ${d.comune}\n` +
    `🗓 ${elenco(d.mesi)}`;

  await Promise.all(chatIds.map(async (id) => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: id, text: testo, parse_mode: 'Markdown' })
      });
      if (!r.ok) logger.warn(`Telegram ${id}: HTTP ${r.status}`);
    } catch (e) {
      logger.warn(`Telegram ${id}: ${e.message}`);
    }
  }));
}

// ── FUNZIONE PRINCIPALE ───────────────────────────────────
exports.notificaCandidatura = onDocumentCreated(
  {
    document: 'candidature/{id}',
    region:   REGIONE,
    secrets:  [GMAIL_APP_PASSWORD, TELEGRAM_BOT_TOKEN],
    memory:   '256MiB'
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() || {};

    if (!d.nome || !d.email) {
      logger.warn('Candidatura senza nome o email, notifica saltata.', { id: event.params.id });
      return;
    }

    const trasporto = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: INDIRIZZO_MITTENTE, pass: GMAIL_APP_PASSWORD.value() }
    });

    const esiti = { interna: false, conferma: false };

    // 1. mail alla segreteria
    try {
      const m = mailInterna(d);
      await trasporto.sendMail({
        from:    `"Candidature sito Omnia" <${INDIRIZZO_MITTENTE}>`,
        to:      INDIRIZZO_DESTINATARIO,
        replyTo: `"${d.nome}" <${d.email}>`,
        subject: m.subject,
        html:    m.html,
        text:    m.text
      });
      esiti.interna = true;
    } catch (e) {
      logger.error('Invio mail interna fallito:', e);
    }

    // 2. conferma al candidato
    if (INVIA_CONFERMA) {
      try {
        const m = mailConferma(d);
        await trasporto.sendMail({
          from:    `"Omnia Adriatic Lifeguard Service" <${INDIRIZZO_MITTENTE}>`,
          to:      d.email,
          replyTo: INDIRIZZO_DESTINATARIO,
          subject: m.subject,
          html:    m.html,
          text:    m.text
        });
        esiti.conferma = true;
      } catch (e) {
        logger.error('Invio mail di conferma fallito:', e);
      }
    }

    // 3. Telegram
    if (INVIA_TELEGRAM) {
      try { await avvisaTelegram(d, TELEGRAM_BOT_TOKEN.value()); }
      catch (e) { logger.warn('Avviso Telegram fallito:', e.message); }
    }

    // traccia l'esito sul documento
    try {
      await snap.ref.update({
        notificaInviata:   esiti.interna,
        confermaInviata:   esiti.conferma,
        notificaTimestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      logger.warn('Aggiornamento stato notifica fallito:', e.message);
    }

    logger.info('Candidatura elaborata', { id: event.params.id, ...esiti });
  }
);
