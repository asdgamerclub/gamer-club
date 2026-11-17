# A.S.D. Gamer Club — sito e anteprima card

Progetto pubblicato su GitHub Pages: https://asdgamerclub.github.io/gamer-club/

## Pagine
- `index.html`: sito ufficiale, logo originale e contatti forniti dall'associazione.
- `card.html`: anteprima interattiva della futura Gamer Club Card.
- `card.js`: demo solo su dati inventati nel browser; 10 partite = 1 premio, premi cumulativi e riscatti simulati.
- `database/schema.sql`: **bozza di database Supabase/Postgres**, con membership, ruoli operatore, storico immutabile dei movimenti e RPC per punti/riscatti. Non è stato ancora installato su un database.

## Importante: non è ancora un servizio per i soci
La demo non raccoglie dati personali, non genera QR validi, non salva punti su un server e non emette pass Wallet. Non utilizzare la demo per iscrizioni o premi reali. Non inserire dati di soci sul repository pubblico.

## Attivazione futura
1. Predisporre informativa sul trattamento dei dati, base giuridica dell'adesione e modulistica associativa.
2. Creare progetto Supabase, configurare autenticazione e applicare/validare schema in ambiente di test.
3. Costruire modulo di registrazione con conferma e ammissione socio, pannello amministrativo con login.
4. Rendere univoci i QR, attivare funzioni di scansione, audit, protezione antiabuso e procedure di recupero.
5. Configurare Apple Developer Pass Type ID / certificato e Google Wallet Issuer, dopo le rispettive approvazioni.
6. Aggiungere servizio sicuro di emissione/aggiornamento pass senza caricare credenziali sul repository.

Regola fidelity prevista: 1 partita pagata registrata dall'operatore = 1 punto; dopo 10 punti si matura 1 partita gratis per due giocatori; premi accumulabili, riscatto confermato da operatore.

Contatti sito: asdgamerclub@gmail.com — Via Erik Mutarelli 2, 4, 6, 82100 Benevento (BN).
