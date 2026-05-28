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

Per Node 20 usa il metodo che preferisci per il server, per esempio `nvm`, `fnm` oppure i pacchetti ufficiali NodeSource.

## Deploy applicazione

```bash
cd /var/www
git clone <URL_REPO_BACKEND> remedic-report-ms
cd /var/www/remedic-report-ms
git pull
npm ci
```

Se in futuro il repository non includesse piu `package-lock.json`, usa `npm install`.

## Configurazione `.env`

Crea manualmente il file:

`/var/www/remedic-report-ms/.env`

Puoi partire da:

```bash
cp .env.example .env
```

Poi inserisci i valori reali richiesti dal server. Non committare mai il file `.env`.

Per abilitare il salvataggio bozze con SQLite:

```bash
sudo mkdir -p /var/lib/remedic-report
sudo chown -R camillo:camillo /var/lib/remedic-report
```

Nel file `.env` imposta:

```bash
DRAFTS_DB_PATH=/var/lib/remedic-report/drafts.sqlite
```

Nota: il file SQLite contiene dati sanitari. Deve stare fuori dal repository, con permessi stretti e backup protetti.

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
