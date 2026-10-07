# TurfBook

## 1. Try it now (no backend)
```bash
cd public
python3 -m http.server 8000      # or: npx serve .
```
Open http://localhost:8000 (booking page) and http://localhost:8000/admin.html (admin).
Demo data = your TurfManagerSystem seed data. It is saved in the browser; use "Reset data" in the bottom bar to start over.

## 2. Go live (real database)
1. MySQL: run `database.sql` once (it builds the whole database with sample data; safe to re-run, it rebuilds from scratch).
2. In `public/index.html` and `public/admin.html`, delete the line `<script src="mock-api.js"></script>`.
3. `npm install`, then start with your settings:
   `DB_HOST=... DB_USER=... DB_PASSWORD=... DB_NAME=TurfManagerSystem ADMIN_PASSWORD=choose-one npm start`
4. Deploy to any host that runs Node and has MySQL (Render, Railway, a VPS). Set the same variables there; `PORT` is picked up automatically.
5. With `ADMIN_PASSWORD` set, the browser asks for it when opening /admin.html (username can be anything). Use HTTPS.
