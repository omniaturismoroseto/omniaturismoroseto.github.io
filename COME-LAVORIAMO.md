# Come lavoriamo

Promemoria del modo di lavorare concordato l'11 novembre 2026. Serve a non
dover ricordare a memoria i comandi, e a evitare l'unico vero guaio possibile:
due versioni dello stesso file che si scontrano.

---

## Il principio

**GitHub sta al centro.** È l'unico posto che raggiungiamo entrambi: Claude
lavora su una copia nel cloud e non può toccare il computer; il computer vede
le modifiche solo quando le scarica da GitHub.

Il PC non è il magazzino dei file. È la **sala macchine**: serve per le cose
che dal cloud non si possono fare.

| Dove | Cosa è | Si aggiorna |
|---|---|---|
| GitHub | la copia buona e tutta la storia | con `git push` |
| Il PC | da dove si pubblica su Firebase e si prova | con `git pull` |
| Il sito online | quello che vedono le persone | da solo, quando qualcosa arriva su `main` |

Attenzione: **git non sincronizza da solo come faceva OneDrive.** Si muove
solo quando glielo si chiede. È voluto: così si decide quando una versione è
buona, le si dà un nome e si può tornare indietro.

---

## Chi fa cosa

**Claude scrive i file e li prova** nel suo ambiente, con un browser
automatico, prima di mandarli. Le modifiche piccole e verificate vanno dritte
su `main`, quindi online; quelle grosse o rischiose vanno prima su un ramo
separato, che **non** finisce online, perché il sito pubblica solo `main`.

**Il PC fa tre cose**, che dal cloud non si possono fare:

1. `git pull`, per avere i file aggiornati;
2. `firebase deploy` di regole e Cloud Functions — **GitHub non le pubblica**,
   partono solo da qui;
3. la prova dal vivo sul sito e sul pannello.

**Se modifichi un file tu**, dillo e fai subito `push`. È l'unico modo per far
scontrare le due versioni: senza `push`, Claude lavora su una copia vecchia e
una delle due modifiche va persa.

---

## I comandi

Tutti dalla cartella del progetto:
`C:\Users\roset\Progetti\SitoWebALS`

### Prima di cominciare — scarica

```powershell
cd "C:\Users\roset\Progetti\SitoWebALS"; git pull origin main
```

### Dove sono arrivato?

```powershell
git status --short --branch
```

- `## main...origin/main` → tutto allineato
- `[ahead 2]` → hai due commit da mandare su, manca il `push`
- `[behind 3]` → ce ne sono tre da scaricare, manca il `pull`
- righe con `M` o `??` → file modificati o nuovi non ancora salvati

### Se hai modificato qualcosa tu — manda su

```powershell
git add -A; git commit -m "descrivi in poche parole cosa hai cambiato"; git push origin main
```

### Pubblicare le regole su Firebase

Dalla stessa cartella, **dopo** aver fatto `pull`:

```powershell
firebase deploy --only firestore:rules
```

```powershell
firebase deploy --only storage
```

### Pubblicare una Cloud Function

Dalla cartella delle functions:

```powershell
cd "C:\Users\roset\Progetti\SitoWebALS\Funzioni del diario\omnia-diario-functions"; firebase deploy --only functions:diario:notificaCandidatura
```

---

## Il flusso tipo

1. Dici cosa serve.
2. Claude scrive e prova nel suo ambiente.
3. Claude pubblica su `main` (online subito) o su un ramo (da guardare prima).
4. Tu fai `pull`; se c'erano regole o functions, anche il `deploy`.
5. Si controlla insieme che funzioni davvero, non solo che "sia stato fatto".

---

## Quando qualcosa va storto

### Una modifica ha rotto qualcosa

Si torna indietro. Serve il codice del commit, che Claude sa sempre dire:

```powershell
git revert --no-edit <codice-del-commit>; git push origin main
```

Se la modifica riguardava le regole, dopo il `revert` serve anche il `deploy`.

### `index.lock: File exists`

Un git precedente è rimasto appeso. Controlla che non ce ne sia uno in corso,
poi:

```powershell
Remove-Item "C:\Users\roset\Progetti\SitoWebALS\.git\index.lock" -Force
```

### `git checkout` chiede di cancellare una cartella e fallisce

Rispondi **`n`** a tutte le richieste: tenere le cartelle è quasi sempre la
cosa giusta. Poi, invece di passare a una versione vecchia, porta il ramo
direttamente a quella aggiornata:

```powershell
git checkout -B main origin/main
```

---

## Cosa NON passa da GitHub

Vale la pena ricordarlo, perché è la fonte di confusione più frequente:

| Cosa | Come si pubblica |
|---|---|
| Pagine del sito (`.html`) | automatico, appena arrivano su `main` |
| `firestore.rules`, `storage.rules` | **a mano**, con `firebase deploy` dal PC |
| Cloud Functions | **a mano**, con `firebase deploy` dal PC |
| Ruoli degli utenti | dall'app segnalazioni |
| Dati (diari, candidature, contatti) | vivono su Firebase, non nel repository |
