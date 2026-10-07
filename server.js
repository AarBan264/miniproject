const express = require('express');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'TurfManagerSystem',
  port: Number(process.env.DB_PORT) || 3306,
  dateStrings: true // keep DATE columns as 'YYYY-MM-DD' (no timezone shifts)
});

const app = express();
app.use(express.json());
app.use('/admin.html', require('./admin').guard); // only asks for a password if ADMIN_PASSWORD is set
app.use(express.static('public'));

const list = (sql) => async (_req, res) => {
  try { res.json((await pool.query(sql))[0]); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// Aliases match the field names the frontend uses
app.get('/api/facilities', list('SELECT fid AS Fid, fname, fsport FROM Facilities'));
app.get('/api/timeslots', list('SELECT tid, `start`, `end` FROM Timeslots ORDER BY tid'));
app.get('/api/coaches', list('SELECT cid, name, phone FROM Coaches'));
app.get('/api/equipment', list('SELECT eid AS Eid, fid AS Fid, item, quantity AS quant FROM EquipmentInventory'));

app.get('/api/availability', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT tid FROM Bookings WHERE fid = ? AND booking_date = ?', [req.query.fid, req.query.date]);
    res.json(rows.map(r => r.tid));
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/bookings', list(
  `SELECT b.bid, CONCAT(LEFT(u.name, 1), '***') AS username, f.fname AS facility, b.booking_date, t.\`start\`, t.\`end\`, c.name AS coach
   FROM Bookings b
   JOIN Users u ON b.uid = u.uid
   JOIN Facilities f ON b.fid = f.fid
   JOIN Timeslots t ON b.tid = t.tid
   LEFT JOIN Coaches c ON b.cid = c.cid
   ORDER BY b.bid DESC LIMIT 50`));

app.post('/api/bookings', async (req, res) => {
  const { name, phone, fid, tid, date, cid = null, equipment = [] } = req.body || {};
  if (!name || !/^\d{10}$/.test(phone || '') || !fid || !tid || !/^\d{4}-\d{2}-\d{2}$/.test(date || ''))
    return res.status(400).json({ error: 'Check your name, 10-digit phone number, facility, date and time slot.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [found] = await conn.query('SELECT uid FROM Users WHERE phone = ?', [phone]);
    let uid;
    if (found.length) uid = found[0].uid;
    else uid = (await conn.query('INSERT INTO Users(name, phone) VALUES (?, ?)', [name, phone]))[0].insertId;

    const [b] = await conn.query(
      'INSERT INTO Bookings(uid, fid, cid, tid, booking_date) VALUES (?, ?, ?, ?, ?)', [uid, fid, cid, tid, date]);
    // your triggers check stock and reduce EquipmentInventory automatically
    for (const eid of equipment)
      await conn.query('INSERT INTO EquipmentUsage(eid, quantity_used, bid) VALUES (?, 1, ?)', [eid, b.insertId]);

    await conn.commit();
    res.status(201).json({ bid: b.insertId });
  } catch (e) {
    await conn.rollback();
    if (e.errno === 1062) return res.status(409).json({ error: /uq_coach/.test(e.sqlMessage) ? 'That coach is already booked at this time. Pick another coach or none.' : 'That slot was just taken. Pick another.' });
    if (e.sqlState === '45000') return res.status(409).json({ error: e.sqlMessage }); // your trigger messages
    console.error(e);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  } finally { conn.release(); }
});

require('./admin')(app, pool); // admin routes

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Turf app running on port ' + PORT));
