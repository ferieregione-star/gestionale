# UfficioFlex v14

Versione stabile pronta per GitHub con React + Supabase.

## Cosa include

- Login reale con Supabase Auth.
- Database Supabase con ruoli e permessi.
- Ruoli: gestore/admin, dipendente, referente, dirigente.
- Settori dinamici gestiti dal gestore.
- Dirigente abilitabile a uno o più settori.
- Calendario ferie/smart working con realtime.
- Notifiche realtime:
  - gestore: registrazioni e password;
  - dipendenti/referenti: modifiche ferie/SW del proprio settore;
  - dirigente: solo visualizzazione.
- Piano ferie per estate, inverno e Pasqua.
- Blocco sabato, domenica e festivi.
- San Vitaliano 16 luglio incluso.
- Base pronta per modulo futuro “Importa PDF”.

## Avvio locale

```bash
npm install
cp .env.example .env
npm run dev
```

## Supabase

1. Crea progetto Supabase.
2. Copia le chiavi in `.env`.
3. Esegui `supabase/schema.sql` nel SQL editor.
4. Avvia l’app.

## Nota email

L’invio email reale non è incluso nel frontend: andrà fatto con Supabase Edge Functions o servizio SMTP.
