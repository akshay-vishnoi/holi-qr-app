# Holi Registration + QR + Check-in (Heroku-ready)

## What this app does
- Family registration form (one registration per family)
- Generates a QR code after registration
- Admin login + mobile camera QR scanner check-in
- Admin dashboard to search registrations and undo check-in

---

## Run locally

### 1) Install deps
```bash
npm install
```

### 2) Create a local Postgres DB
Example (psql):
```bash
createdb holi_qr
```

### 3) Configure env
Copy `.env.example` to `.env` and set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`:
```bash
cp .env.example .env
```

### 4) Run migrations
```bash
npm run migrate
```

### 5) Start the server
```bash
npm start
```

Open:
- Registration: http://localhost:3000/
- Admin login: http://localhost:3000/admin/login
- Scanner: http://localhost:3000/admin/checkin
- Admin dashboard: http://localhost:3000/admin/dashboard

---

## Deploy to Heroku (Git-based)

> Requirements: Heroku CLI installed and logged in.

### 1) Create app + Postgres
```bash
heroku login
heroku create your-holi-registration
heroku addons:create heroku-postgresql:essential-0 -a your-holi-registration
```

### 2) Set config vars (important)
```bash
heroku config:set JWT_SECRET="a-very-long-random-string" -a your-holi-registration
heroku config:set ADMIN_PASSWORD="your-strong-password" -a your-holi-registration
```

### 3) Deploy
```bash
git init
git add .
git commit -m "Holi QR registration"
heroku git:remote -a your-holi-registration
git push heroku main
```

### 4) Run migrations on Heroku
```bash
heroku run npm run migrate -a your-holi-registration
```

### 5) Open
```bash
heroku open -a your-holi-registration
```

Admin:
- https://YOUR-APP.herokuapp.com/admin/login

---

## Notes / Tips
- Use 2–3 phones for check-in. All can login with the same admin password (MVP).
- If camera permissions fail, ensure you're using HTTPS (Heroku provides HTTPS by default).
