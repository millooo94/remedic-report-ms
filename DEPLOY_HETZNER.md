# Deploy Hetzner Ubuntu

Questa applicazione puo essere deployata senza Docker su un server Ubuntu Hetzner come servizio `systemd` dietro Nginx.

## Percorso consigliato

`/var/www/remedic-report-ms`

## Prerequisiti

- Node.js 20
- npm
- Nginx
- Certbot
- Chromium installato sul server

Esempio pacchetti Ubuntu:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx chromium
```

## Deploy applicazione

```bash
cd /var/www
git clone <URL_REPO_BACKEND> remedic-report-ms
cd /var/www/remedic-report-ms
npm ci
```

Se in futuro il repository non includesse piu `package-lock.json`, usa `npm install`.

## Configurazione `.env`

```bash
cp .env.example .env
```

Nel file `.env` imposta almeno:

```bash
PORT=4010
NODE_ENV=production
FRONTEND_URL=https://report.remedic.it
APP_PUBLIC_URL=https://report.remedic.it
CORS_ORIGIN=https://report.remedic.it
PDF_API_KEY=change-me

AUTH_SESSION_COOKIE_NAME=remedic_session
AUTH_CSRF_COOKIE_NAME=remedic_csrf
AUTH_COOKIE_SAMESITE=none
AUTH_COOKIE_SECURE=true
SESSION_TTL_HOURS=8

DRAFTS_DB_PATH=/var/lib/remedic-report/drafts.sqlite
DRAFTS_UPLOAD_DIR=/var/lib/remedic-report/uploads

ROOT_FOLDER=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
DRIVE_DEBUG=false

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SIGNED_PDF_NOTIFICATION_EMAIL=humancaretelemedicine@gmail.com
```

## Directory persistenti

```bash
sudo mkdir -p /var/lib/remedic-report
sudo mkdir -p /var/lib/remedic-report/uploads
sudo chown -R camillo:camillo /var/lib/remedic-report
```

Nota: sia il file SQLite sia la directory uploads contengono dati sanitari e devono stare fuori dal repository, con permessi stretti e backup protetti.

## Sessioni HttpOnly e CORS

Il frontend e il backend lavorano in cross-site, quindi in produzione conviene usare:

- `AUTH_COOKIE_SAMESITE=none`
- `AUTH_COOKIE_SECURE=true`

In sviluppo locale puoi usare:

- `AUTH_COOKIE_SAMESITE=lax`
- `AUTH_COOKIE_SECURE=false`

La UI usa cookie di sessione HttpOnly e token CSRF separato. Non usare piu token di login in `sessionStorage` come meccanismo principale.

## PDF standard vs preview vs firmato

Il backend distingue ora tre casi:

- `POST /pdf`
  genera il PDF e usa il normale upload su Google Drive. Questo flusso resta quello del referto standard.
- `POST /pdf/preview`
  genera un PDF temporaneo senza salvarlo su Google Drive. Questo flusso va usato per EMG e PSG quando il documento deve essere controllato o firmato esternamente.
- `POST /drafts/:id/signed-pdf`
  oppure `POST /refertatore/drafts/:id/signed-pdf`
  riceve un PDF gia firmato, lo salva negli uploads persistenti e poi lo archivia su Google Drive come documento definitivo del refertatore assegnato.

Per EMG e PSG, quindi, il documento definitivo su Drive nasce solo dal caricamento del PDF gia firmato, non dall'export temporaneo.

## Creazione utenti da server

### Admin

```bash
cd /var/www/remedic-report-ms
npm run user:upsert -- --role admin --email admin@remedic.it --password "ChangeMe!2026" --name "Admin Remedic"
```

### Refertatore EMG

```bash
npm run user:upsert -- --role refertatore --email sebastianoarenaneurologo@gmail.com --password "Rmdc-Neuro!2026-Arena" --name "Dott. Sebastiano Arena" --specializzazione "Neurologia" --assigned emg
```

### Refertatore PSG

```bash
npm run user:upsert -- --role refertatore --email refertatore.psg@remedic.it --password "ChangeMe!2026" --name "Dott. Refertatore PSG" --specializzazione "Pneumologia" --assigned psg
```

### Refertatore EMG + PSG

```bash
npm run user:upsert -- --role refertatore --email refertatore.misto@remedic.it --password "ChangeMe!2026" --name "Dott. Refertatore Misto" --specializzazione "Neurologia" --assigned emg,psg
```

La password mostrata sopra e solo temporanea: non viene salvata in chiaro nel DB e puo essere cambiata rilanciando lo stesso comando con una nuova password.

## Avvio locale sul server

```bash
cd /var/www/remedic-report-ms
npm start
curl http://127.0.0.1:4010/health
```

Il test health deve rispondere `OK`.

## Esempio systemd

File:

`/etc/systemd/system/remedic-report-ms.service`

```ini
[Unit]
Description=Remedic Report MS
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/remedic-report-ms
Environment=NODE_ENV=production
EnvironmentFile=/var/www/remedic-report-ms/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Comandi utili:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now remedic-report-ms
sudo systemctl status remedic-report-ms
journalctl -u remedic-report-ms -f
```

## Esempio Nginx

File:

`/etc/nginx/sites-available/report-api.remedic.it`

```nginx
server {
    listen 80;
    server_name report-api.remedic.it;

    location / {
        proxy_pass http://127.0.0.1:4010;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Abilitazione sito e reload:

```bash
sudo ln -s /etc/nginx/sites-available/report-api.remedic.it /etc/nginx/sites-enabled/report-api.remedic.it
sudo nginx -t
sudo systemctl reload nginx
```

## Certificato TLS

Dopo che il DNS punta al server:

```bash
sudo certbot --nginx -d report-api.remedic.it
```

## Backup

Includi nei backup:

- `DRAFTS_DB_PATH`
- `DRAFTS_UPLOAD_DIR`

Per EMG e PSG gli uploads contengono:

- tracciati EMG
- firma TNFP
- report strumentale PSG persistito
- PDF firmati caricati

## Aggiornamenti successivi

```bash
cd /var/www/remedic-report-ms
git pull
npm ci
sudo systemctl restart remedic-report-ms
sudo systemctl status remedic-report-ms
journalctl -u remedic-report-ms -f
```

Se aggiungi o aggiorni dipendenze native come `better-sqlite3`, assicurati di eseguire `npm ci` o `npm install` anche sul server prima del riavvio del servizio.
