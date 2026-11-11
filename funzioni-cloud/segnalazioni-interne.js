/**
 * ════════════════════════════════════════════════════════════
 *  SEGNALAZIONI INTERNE ANONIME — Omnia Adriatic Lifeguard Service
 * ════════════════════════════════════════════════════════════
 *  Si attiva quando la pagina /segnalazioni-interne scrive un
 *  documento nella collection "segnalazioniInterne".
 *
 *  Manda una sola mail, alla direzione. Nessun Telegram: una
 *  segnalazione puo' riguardare un collega o un responsabile, e
 *  il gruppo Telegram del diario ha piu' destinatari.
 *
 *  Il documento non contiene nulla che identifichi chi scrive:
 *  niente nome, niente recapito obbligatorio, e la data e' senza
 *  orario, cosi' non si risale a chi era in turno.
 * ════════════════════════════════════════════════════════════
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret }      = require('firebase-functions/params');
const logger                = require('firebase-functions/logger');
const admin                 = require('firebase-admin');
const nodemailer            = require('nodemailer');

if (!admin.apps.length) admin.initializeApp();

// ── IMPOSTAZIONI ──────────────────────────────────────────
const INDIRIZZO_MITTENTE     = 'omniaturismoroseto@gmail.com';
const INDIRIZZO_DESTINATARIO = 'omniaturismoroseto@gmail.com';
const REGIONE                = 'europe-west1';

const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

// ── UTILITA' ──────────────────────────────────────────────
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dataIta = (iso) => {
  if (!iso) return '—';
  const [a, m, g] = String(iso).split('-');
  return (g && m && a) ? `${g}/${m}/${a}` : iso;
};

function riga(etichetta, valore) {
  if (!valore) return '';
  return `<tr>
    <td style="padding:11px 16px;border-bottom:1px solid #e6eaef;color:#6b7f96;font-size:13px;width:34%;vertical-align:top">${esc(etichetta)}</td>
    <td style="padding:11px 16px;border-bottom:1px solid #e6eaef;font-size:14px;color:#1a3a5c">${esc(valore)}</td>
  </tr>`;
}

// ── LA MAIL ───────────────────────────────────────────────
function componi(d) {
  const urgente = d.urgenza === 'Urgente';

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px 12px;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:6px;overflow:hidden;box-shadow:0 2px 12px rgba(7,17,31,.08)">

    <div style="background:#07111f;padding:26px 24px">
      <div style="color:#ff5c1a;font-size:11px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:8px">Segnalazione interna anonima</div>
      <div style="color:#ffffff;font-size:22px;font-weight:600">${esc(d.categoria || 'Senza categoria')}</div>
    </div>

    ${urgente ? `<div style="background:#fff4ed;border-left:4px solid #ff5c1a;padding:13px 20px;color:#7a3c18;font-size:13px">
      <b>Segnalata come urgente</b> da chi l'ha scritta.
    </div>` : ''}

    <div style="padding:20px;background:#f7f9fb;border-bottom:1px solid #e6eaef">
      <div style="color:#6b7f96;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">Il messaggio</div>
      <div style="color:#1a3a5c;font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(d.messaggio)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse">
      ${riga('Categoria', d.categoria)}
      ${riga('Urgenza', d.urgenza)}
      ${riga('Dove', d.dove)}
      ${riga('Giorno', dataIta(d.data))}
      ${riga('Recapito lasciato', d.contatto)}
    </table>

    ${d.contatto
      ? `<div style="padding:18px 20px;background:#ffffff;border-top:1px solid #e6eaef;color:#1a3a5c;font-size:13.5px;line-height:1.6">
           Chi ha scritto ha <b>scelto</b> di lasciare un recapito per avere una risposta.
           Usalo solo per rispondere a questa segnalazione.
         </div>`
      : `<div style="padding:18px 20px;background:#ffffff;border-top:1px solid #e6eaef;color:#6b7f96;font-size:13.5px;line-height:1.6">
           Nessun recapito lasciato: <b>non c'e' modo di rispondere</b>, ed e' una scelta di chi ha scritto.
         </div>`}

    <div style="padding:16px 20px;background:#07111f;color:#6b7f96;font-size:11px;text-align:center;line-height:1.6">
      Ricevuta dal modulo riservato su adriaticlifeguardservice.it/segnalazioni-interne<br>
      Non contiene nome, dispositivo ne' orario: solo il giorno.
    </div>
  </div>
</body></html>`;

  const testo = [
    `SEGNALAZIONE INTERNA ANONIMA`,
    `Categoria: ${d.categoria || '—'}`,
    `Urgenza: ${d.urgenza || 'Normale'}`,
    d.dove ? `Dove: ${d.dove}` : '',
    `Giorno: ${dataIta(d.data)}`,
    '',
    'Messaggio:',
    d.messaggio || '',
    '',
    d.contatto ? `Recapito lasciato: ${d.contatto}` : 'Nessun recapito lasciato: non e\' possibile rispondere.'
  ].filter(Boolean).join('\n');

  return {
    subject: `${urgente ? '[URGENTE] ' : ''}Segnalazione interna — ${d.categoria || 'senza categoria'}`,
    html,
    text: testo
  };
}

// ── FUNZIONE PRINCIPALE ───────────────────────────────────
exports.notificaSegnalazioneInterna = onDocumentCreated(
  {
    document: 'segnalazioniInterne/{id}',
    region:   REGIONE,
    secrets:  [GMAIL_APP_PASSWORD],
    memory:   '256MiB'
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const d = snap.data() || {};

    if (!d.messaggio) {
      logger.warn('Segnalazione senza messaggio, notifica saltata.', { id: event.params.id });
      return;
    }

    let inviata = false;
    try {
      const trasporto = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: INDIRIZZO_MITTENTE, pass: GMAIL_APP_PASSWORD.value() }
      });
      const m = componi(d);
      await trasporto.sendMail({
        from:    `"Segnalazioni interne" <${INDIRIZZO_MITTENTE}>`,
        to:      INDIRIZZO_DESTINATARIO,
        subject: m.subject,
        html:    m.html,
        text:    m.text
        // Nessun replyTo: la segnalazione e' anonima. L'eventuale
        // recapito scelto da chi scrive e' nel corpo della mail.
      });
      inviata = true;
    } catch (e) {
      logger.error('Invio della segnalazione interna fallito:', e);
    }

    try {
      await snap.ref.update({ notificaInviata: inviata });
    } catch (e) {
      logger.warn('Aggiornamento stato notifica fallito:', e.message);
    }

    logger.info('Segnalazione interna elaborata', { id: event.params.id, inviata });
  }
);
