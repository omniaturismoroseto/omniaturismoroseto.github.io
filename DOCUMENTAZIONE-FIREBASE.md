# Configurazione Firebase — come è messo il progetto

Appunti sulla configurazione del progetto Firebase che sta dietro al sito,
al diario e all'app segnalazioni. Serve a non doverla ricostruire ogni volta
dalla console.

Ultimo aggiornamento: 11 novembre 2026.

---

## Progetto

| | |
|---|---|
| ID progetto | `app-segnalazioni-omnia-roseto` |
| Numero progetto | `699028105579` |
| Regione delle Cloud Functions | `europe-west1` |
| Bucket Storage | `app-segnalazioni-omnia-roseto.firebasestorage.app` |
| Piano | a consumo (Blaze), necessario per le Cloud Functions |

Esiste anche un secondo progetto Google Cloud, **`als-kiosk-gestito`**, legato al
chiosco. Non è documentato qui, ma la sua console (`als-kiosk-console.web.app`)
usa la stessa chiave browser di questo progetto.

---

## Due database, non uno

È la cosa che genera più confusione: il progetto ha **due database distinti**,
con **due file di regole separati**.

| Database | Chi lo usa | Regole |
|---|---|---|
| **Realtime Database** | App segnalazioni (`reports`) | solo dalla console Firebase |
| **Cloud Firestore** | Diario, candidature, configurazione | `firestore.rules` in questo repository |

Le regole del Realtime Database usano i ruoli degli utenti
(`auth.token.role`): `admin`, `coordinator`, `cp`, `forze_ordine`,
`operator`, `station`.

### Collection Firestore

| Collection | Scritta da | Letta da |
|---|---|---|
| `diariogiornaliero` | `diariogiornaliero.html` | `admin-diario.html` |
| `config/telegram_diario` | `admin-diario.html` | pannello admin e Cloud Function |
| `candidature` | `candidature/index.html` | solo console e Cloud Function |
| `meteoGiornaliero`, `osservazioniManuali`, `stazioneLocale`, `stazioniPubblicheNetatmo`, `calibrazioneMeteo`, `statisticheStoriche`, `statoRadar`, `statoSistema`, `grigliaAdriatico`, `meteoCroazia`, `previsioneEnsemble` | sistema meteo | utenti autenticati |
| `richiesteLidi`, `destinatariLidi` | gestione lidi | utenti autenticati |

---

## Regole: dove stanno e come si pubblicano

I file validi sono **in questo repository**, non nella console. Chi modifica le
regole dalla console le perde al deploy successivo.

| File | Cosa copre |
|---|---|
| `firestore.rules` | tutte le collection Firestore |
| `storage.rules` | foto e video del diario |
| `firebase.json` | dice a Firebase dove trovare i due file |
| `.firebaserc` | progetto predefinito, evita di scrivere `--project` |

Dalla cartella del sito:

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
```

---

## Chiavi API

Nel progetto ci sono tre chiavi (Google Cloud Console → API e servizi →
Credenziali):

| Chiave | Uso |
|---|---|
| Browser key (auto created by Firebase) | sito, diario, candidature — termina con `...zRSiXQA` |
| Android key × 2 | app Android delle segnalazioni |

### Domini autorizzati sulla chiave browser

La chiave accetta richieste **solo** da questi siti:

- `https://adriaticlifeguardservice.it/*`
- `https://www.adriaticlifeguardservice.it/*`
- `https://omniaturismoroseto.github.io/*`
- `als-kiosk-console.web.app/*`
- `http://localhost/*`

Attenzione a due cose:

1. Le richieste **senza** dominio di provenienza (per esempio da `curl` o da uno
   script) vengono rifiutate con *"Requests from referer &lt;empty&gt; are blocked"*.
2. La restrizione **non vale per Firestore e Storage**, che si difendono con le
   proprie regole. Vale invece per l'autenticazione: un dominio nuovo che debba
   fare il login va aggiunto a questo elenco.

### API abilitate sulla chiave browser

26 API, elencate qui perché una chiave con meno API attive è una chiave più
sicura, e perché se in futuro qualcosa smette di funzionare conviene prima
controllare se l'API corrispondente è ancora in elenco.

```
Cloud Datastore API                        Firebase In-App Messaging API
Cloud Firestore API                        Firebase Installations API
Cloud Logging API                          Firebase Management API
Cloud SQL Admin API                        Firebase ML API
Cloud Storage for Firebase API             Firebase Phone Number Verification API
FCM Registration API                       Firebase Realtime Database Management API
Firebase AI Logic API                      Firebase Remote Config API
Firebase App Check API                     Firebase Remote Config Realtime API
Firebase App Distribution API              Firebase Rules API
Firebase App Hosting API                   Firebase SQL Connect API
Firebase App Testers API                   Identity Toolkit API
Firebase Hosting API                       Maps JavaScript API
                                           ML Kit API
                                           Token Service API
```

Le tre che contano per i lavori in corso: **Identity Toolkit API** (il login),
**Firebase App Check API** (protezione futura), **Maps JavaScript API** (mappe
dell'app segnalazioni).

---

## Autenticazione

| | |
|---|---|
| Provider abilitato | **Email/password**, unico attivo |
| Ruoli | custom claim `role` sul token dell'utente |
| Valori del ruolo | `admin`, `coordinator`, `cp`, `forze_ordine`, `operator`, `station` |

Gli utenti sono quelli dell'app segnalazioni: stesso progetto, stesso elenco.
Una pagina nuova che debba autenticare usa gli stessi account, e puo' limitare
l'accesso leggendo il ruolo dal token:

```js
const token = await firebase.auth().currentUser.getIdTokenResult();
if (!['admin', 'coordinator'].includes(token.claims.role)) { /* nega */ }
```

Nelle regole Firestore lo stesso controllo si scrive cosi':

```
request.auth != null && request.auth.token.role in ['admin', 'coordinator']
```

Chi autentica deve essere servito da un dominio presente nell'elenco dei
domini autorizzati sulla chiave browser, altrimenti il login fallisce.

---

## Cloud Functions

Codebase `diario`, cartella `Funzioni del diario/omnia-diario-functions`
(fuori da questo repository, ha un suo git). Dichiarata in un `firebase.json`
proprio, con `"codebase": "diario"`.

| Function | Cosa fa |
|---|---|
| `notificaCandidatura` | manda le mail a ogni nuova candidatura (vedi `funzioni-candidature/LEGGIMI.md`) |
| `inviaTestTelegram` | messaggio di prova dal pannello admin |
| altre del diario | promemoria e notifiche Telegram |

Deploy di una sola function:

```bash
firebase deploy --only functions:diario:notificaCandidatura
```

### Secret

Valori cifrati nel Secret Manager, mai nel codice:

| Secret | Usato da |
|---|---|
| `GMAIL_APP_PASSWORD` | invio mail delle candidature |
| `TELEGRAM_BOT_TOKEN` | notifiche Telegram |

Si impostano con `firebase functions:secrets:set NOME`.

---

## Risolto

- **`admin-diario.html` chiede le credenziali** (dal 11 novembre 2026). Entrano
  solo gli account con ruolo `admin` o `coordinator`; prima dell'accesso la
  pagina non legge nulla da Firestore. Di conseguenza `config/telegram_diario`
  non e' piu' leggibile ne' scrivibile senza autenticazione.

## Dove sta il codice

| Cosa | Dove | Repository GitHub |
|---|---|---|
| Sito, regole, documentazione | `C:\Users\roset\Progetti\SitoWebALS` | `omniaturismoroseto.github.io` |
| Cloud Functions del diario | la sottocartella `Funzioni del diario\omnia-diario-functions` | `omnia-diario-functions` |

Dall'11 novembre 2026 il codice sta **fuori da OneDrive**: la sincronizzazione
teneva aperti i file di git e faceva fallire checkout e pull con
`index.lock: File exists`. Il backup sono i due repository GitHub, non OneDrive.

## Cose note e non ancora risolte

- **`diariogiornaliero.html` è pubblico**: chiunque può leggere lo storico e
  inserire voci. Le regole lo consentono perché la pagina non autentica.
  *Deciso l'11/11/2026: sospeso. L'accesso verrà gestito quando il diario
  confluirà nell'app del dispositivo, non con un login sulla pagina web.*
- **Account di prova da cancellare**: `__claudeProdVerify__`,
  `__claudeRebuildTest__`, `__claudeVerifyFix__`, `__claudeStationTest__`,
  `debug-operator-test`. Hanno ruolo operatore.
  *Deciso l'11/11/2026: verranno rimossi dall'app segnalazioni alla prossima
  modifica di quella app.*
- **App Check non è attivo.** Verificherebbe che le richieste arrivino davvero
  dalle vostre pagine, bloccando script e bot esterni. Non sostituisce il
  login: chi apre una vostra pagina dal browser passa comunque il controllo.

