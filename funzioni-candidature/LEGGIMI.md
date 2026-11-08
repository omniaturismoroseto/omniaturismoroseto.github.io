# Notifiche candidature — istruzioni

La pagina **`/candidature`** del sito salva ogni candidatura nella collection Firestore
`candidature` del progetto `app-segnalazioni-omnia-roseto`.

Il file `candidature.js` è la Cloud Function che, appena arriva una candidatura:

1. manda la **mail con tutti i dati** a `omniaturismoroseto@gmail.com`;
2. manda al candidato una **mail di conferma**;
3. manda un **avviso su Telegram** (facoltativo, riusa il bot del diario).

> Finché la function non è installata la pagina **funziona lo stesso**: le candidature
> si salvano su Firestore e si leggono dalla console Firebase. Senza function, però,
> non arriva nessuna mail.

---

## 1. Regole Firestore (obbligatorio)

Senza questa regola il browser non può scrivere e il form dà errore.
Console Firebase → **Firestore** (non Realtime Database: sono due database
diversi, con due file di regole separati) → scheda **Regole**.

Le regole stanno in **`firestore.rules`**, nella radice del repository: quello
e' l'unico file valido, ed e' la sorgente che usa `firebase deploy`. Non
modificarle dalla console, altrimenti il prossimo deploy le sovrascrive.

Per pubblicarle, dalla radice del repository:

```bash
firebase deploy --only firestore:rules
```

Il blocco che riguarda le candidature e' questo:

```
match /candidature/{id} {
  // chiunque può inviare una candidatura dal sito…
  allow create: if request.resource.data.privacy == true
                && request.resource.data.stato == 'nuova'
                && request.resource.data.nome is string
                && request.resource.data.nome.size() > 1
                && request.resource.data.nome.size() < 100
                && request.resource.data.email is string
                && request.resource.data.email.size() < 120
                && request.resource.data.telefono is string
                && request.resource.data.telefono.size() < 30
                && request.resource.data.get('note', '').size() < 1500;

  // …ma nessuno può leggerle o modificarle dal web
  allow read, update, delete: if false;
}
```

Le candidature restano leggibili dalla **console Firebase** e dalla function
(l'Admin SDK ignora le regole).

---

## 2. Installare la function

Si aggiunge al progetto functions che usi già per il diario
(`Funzioni del diario/omnia-diario-functions/functions`).

```bash
cd "Funzioni del diario/omnia-diario-functions/functions"
```

Copia qui dentro il file `candidature.js`, poi installa nodemailer:

```bash
npm install nodemailer
```

In fondo a `index.js` aggiungi una riga:

```js
exports.notificaCandidatura = require('./candidature').notificaCandidatura;
```

---

## 3. Password per le app di Google

La function invia dall'account Gmail `omniaturismoroseto@gmail.com`. Serve una
*password per le app* (non la password normale dell'account):

1. l'account deve avere la **verifica in due passaggi attiva**
   (myaccount.google.com → Sicurezza);
2. vai su **myaccount.google.com/apppasswords**;
3. crea una password, nome a piacere (es. "Candidature sito");
4. copia i 16 caratteri che ti mostra.

Salvala come secret del progetto:

```bash
firebase functions:secrets:set GMAIL_APP_PASSWORD
```

Incolla i 16 caratteri **senza spazi** quando te la chiede.

### Telegram (facoltativo)

L'avviso Telegram usa lo stesso bot del diario e gli stessi destinatari
(`config/telegram_diario`). Serve il token del bot come secret:

```bash
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
```

Se salti questo passaggio non succede nulla di male: la function registra
"Telegram saltato" nei log e le mail partono comunque.

---

## 4. Deploy

```bash
firebase deploy --only functions:notificaCandidatura
```

La function gira in **europe-west1**, come le altre.

---

## 5. Prova

Compila il form su `https://adriaticlifeguardservice.it/candidature` con dati finti.
Devono succedere tre cose:

- il documento compare in **Firestore → candidature**;
- la mail arriva su `omniaturismoroseto@gmail.com`;
- il documento si aggiorna con `notificaInviata: true`.

Se `notificaInviata` resta `false`, il motivo è nei log:

```bash
firebase functions:log --only notificaCandidatura
```

---

## 6. Modifiche rapide

Tutto si cambia nelle prime righe di `candidature.js`:

| Cosa | Riga |
|---|---|
| Indirizzo che riceve le candidature | `INDIRIZZO_DESTINATARIO` |
| Account Gmail che invia | `INDIRIZZO_MITTENTE` |
| Disattivare la mail di conferma al candidato | `INVIA_CONFERMA = false` |
| Disattivare Telegram | `INVIA_TELEGRAM = false` |

Dopo ogni modifica, ri-deploya con il comando del punto 4.

> Se cambi `INDIRIZZO_MITTENTE` con un altro account Gmail, serve una nuova
> password per le app di *quell'* account.
