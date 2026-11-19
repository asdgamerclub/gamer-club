# Galleria fotografica ASD Gamer Club

## Stato
La homepage e la pagina `galleria.html` sono pubblicate. Gli upload su Supabase sono **da attivare**.

## Attivazione senza credenziali segrete
1. Nel progetto Supabase `gamer-club-card`, aprire SQL Editor > New query.
2. Copiare ed eseguire tutto `database/migrazione_v3_galleria.sql`.
3. In Supabase > Authentication > URL Configuration, aggiungere tra i Redirect URLs:
   `https://asdgamerclub.github.io/gamer-club/galleria.html`
4. In Supabase > Authentication > Sign In / Providers, verificare che l'accesso Email/OTP sia abilitato e che il servizio email possa recapitare i link.
5. In `galleria-config.js`, inserire solo la **publishable key** (`sb_publishable_...`) o la **anon public key** del progetto nel campo `publishableKey`. Non inserire mai `service_role` / `sb_secret_`.
6. Verificare con una foto propria: login email > upload foto <=4MB > pannello amministrativo > sezione Galleria > Approva.
7. Testare l'accesso in incognito e da cellulare. L'utente vede solo foto approvate.

## Permessi
- Visitatori anonimi possono vedere la galleria pubblicata.
- Chi accede con email verificata può inviare immagini fino a 4 MB e 5 foto al giorno; ogni foto è `pending`.
- Solo gli operatori riconosciuti da `public.gc_is_operator()` possono approvare/rifiutare.
- Le immagini sono nel bucket `gc-gallery` non pubblico e sono mostrate attraverso URL firmati temporanei soltanto dopo autorizzazione.

## Privacy e gestione
- Prima del go-live pubblicare informativa fotografica e definire i tempi di conservazione.
- Le immagini di persone riconoscibili devono avere autorizzazione; per minorenni anche del genitore/tutore.
- Il client converte la foto in WEBP e rimuove normalmente i metadati EXIF ma non sostituisce una revisione manuale.
- Verificare che ogni pubblicazione rispetti diritti d'immagine, minori, privacy, e che non compaiano documenti o dati personali.
- La moderazione rifiuta e tenta di cancellare l'oggetto rifiutato; per errori di eliminazione provvedere dalla dashboard Storage.

## Sito Higgsfield
La versione ospitata su Higgsfield mostra le nuove immagini VR/PS5 e rimanda alla stessa galleria su GitHub Pages. Le tessere e i punti sono sempre gestiti dal sito originale e Supabase.
