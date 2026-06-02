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

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=remedic_report
MYSQL_USER=remedic_report_user
MYSQL_PASSWORD=
MYSQL_CONNECTION_LIMIT=10

APP_ENCRYPTION_KEY=
TOTP_ISSUER="Remedic Report"
ALLOWED_CREATION_IPS=1.2.3.4,5.6.7.8
TRUST_PROXY=loopback, linklocal, uniquelocal

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

## Bootstrap database MySQL

Assicurati che il database MySQL esista e che l'utente applicativo abbia permessi su schema e tabelle:

```sql
CREATE DATABASE remedic_report CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'remedic_report_user'@'127.0.0.1' IDENTIFIED BY 'change-me';
GRANT ALL PRIVILEGES ON remedic_report.* TO 'remedic_report_user'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Poi esegui le migration:

```bash
cd /var/www/remedic-report-ms
npm run db:migrate
```

Questa revisione crea lo schema MySQL da zero. Non include una migrazione automatica dei dati storici da SQLite a MySQL: se devi portare dati esistenti, serve uno script dedicato di import.

## Directory persistenti

```bash
sudo mkdir -p /var/lib/remedic-report
sudo mkdir -p /var/lib/remedic-report/uploads
sudo chown -R camillo:camillo /var/lib/remedic-report
```

Nota: la directory uploads contiene dati sanitari e deve stare fuori dal repository, con permessi stretti e backup protetti. Il database MySQL va protetto con accesso limitato, backup cifrati e retention coerente con le policy sanitarie.

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
  riceve un PDF gia firmato e lo salva negli uploads persistenti del sistema.

Per EMG e PSG, il documento definitivo su Drive viene ora archiviato dall'Admin dall'Archivio asincroni tramite l'azione dedicata `Salva su Drive`, non dall'export temporaneo e non automaticamente dal caricamento firmato.

## Creazione utenti da server

### Admin

```bash
cd /var/www/remedic-report-ms
npm run user:upsert -- --role admin --email admin@remedic.it --password "ChangeMe!2026" --name "Admin Remedic"
```

### Refertatore EMG

```bash
npm run user:upsert -- --role refertatore --professionalId <PROFESSIONAL_ID> --email refertatore.emg@remedic.it --password "ChangeMe!2026" --name "Dott. Refertatore EMG" --specializzazione "Neurologia" --assigned emg
```

### Refertatore PSG

```bash
npm run user:upsert -- --role refertatore --professionalId <PROFESSIONAL_ID> --email refertatore.psg@remedic.it --password "ChangeMe!2026" --name "Dott. Refertatore PSG" --specializzazione "Pneumologia" --assigned psg
```

### Refertatore EMG + PSG

```bash
npm run user:upsert -- --role refertatore --professionalId <PROFESSIONAL_ID> --email refertatore.misto@remedic.it --password "ChangeMe!2026" --name "Dott. Refertatore Misto" --specializzazione "Neurologia" --assigned emg,psg
```

### Professionista con sola area riservata

```bash
npm run user:upsert -- --role professionista --email professionista@remedic.it --password "ChangeMe!2026" --name "Dott. Professionista" --specializzazione "Medicina Interna"
```

La password mostrata sopra e solo temporanea: non viene salvata in chiaro nel DB e puo essere cambiata rilanciando lo stesso comando con una nuova password.
Al primo accesso l'utente dovra configurare obbligatoriamente la 2FA tramite Authenticator App e salvare i recovery code mostrati una sola volta.

## Regole accesso e IP

- l'Area Admin resta accessibile da qualunque IP, ma richiede login, sessione valida, CSRF e 2FA obbligatoria.
- l'Area Riservata per professionisti e refertatori resta accessibile da qualunque IP, ma richiede login e 2FA obbligatoria.
- il blocco IP vale solo per la creazione operativa dei referti e per gli endpoint pubblici collegati al wizard.
- `ALLOWED_CREATION_IPS` deve contenere gli IP pubblici autorizzati della struttura o delle postazioni abilitate.
- i refertatori asincroni autenticati possono comunque creare i soli tipi di referto coerenti con i loro assignment anche da IP non presente in whitelist.

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

- database MySQL `remedic_report`
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

Se aggiungi o aggiorni dipendenze applicative, esegui sempre `npm ci` o `npm install`, poi `npm run db:migrate`, prima del riavvio del servizio.
