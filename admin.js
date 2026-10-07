// No login page. Admin is open unless ADMIN_PASSWORD is set; then the browser asks for it (username can be anything).
const PASS = process.env.ADMIN_PASSWORD || null;
if (!PASS) console.warn('WARNING: admin has no password. Set ADMIN_PASSWORD before deploying.');
const guard = (req, res, next) => {
  if (!PASS) return next();
  const given = Buffer.from((req.get('authorization') || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
  if (given === PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="TurfBook Admin"').status(401).send('Login required');
};

const T = { // table config: db table, primary key, editable columns
  facilities: { t: 'Facilities', pk: 'fid', c: ['fsport', 'fname'] },
  timeslots: { t: 'Timeslots', pk: 'tid', c: ['start', 'end'] },
  coaches: { t: 'Coaches', pk: 'cid', c: ['name', 'phone'] },
  equipment: { t: 'EquipmentInventory', pk: 'eid', c: ['item', 'quantity', 'fid'] },
  users: { t: 'Users', pk: 'uid', c: ['name', 'phone'] }
};
const NUM = ['start', 'end', 'quantity', 'fid'];

module.exports = (app, pool) => {
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (e.errno === 1451) return res.status(409).json({ error: 'This is used by existing bookings or equipment. Remove those first.' });
      if (e.errno === 1452) return res.status(400).json({ error: 'Pick a valid facility, slot, coach or user.' });
      if (e.errno === 1062) {
        const m = e.sqlMessage || '';
        return res.status(409).json({ error: m.includes('uq_coach') ? 'That coach is already booked at this time.'
          : m.includes('uq_facility') ? 'That facility is already booked at this time.'
          : 'Duplicate value: that name, phone or slot already exists.' });
      }
      if (e.sqlState === '45000') return res.status(409).json({ error: e.sqlMessage });
      console.error(e); res.status(500).json({ error: 'Server error' });
    }
  };

  app.use('/api/admin', guard);

  // ---- bookings (registered before the generic routes) ----
  app.get('/api/admin/bookings', wrap(async (_req, res) => {
    res.json((await pool.query(
      `SELECT b.bid, b.uid, b.fid, b.tid, b.cid, b.booking_date, u.name AS username, u.phone,
              f.fname AS facility, t.\`start\`, t.\`end\`, c.name AS coach,
              (SELECT GROUP_CONCAT(CONCAT(eu.quantity_used, ' x ', ei.item) SEPARATOR ', ')
                 FROM EquipmentUsage eu JOIN EquipmentInventory ei ON ei.eid = eu.eid WHERE eu.bid = b.bid) AS equipment
       FROM Bookings b
       JOIN Users u ON u.uid = b.uid JOIN Facilities f ON f.fid = b.fid JOIN Timeslots t ON t.tid = b.tid
       LEFT JOIN Coaches c ON c.cid = b.cid
       ORDER BY b.booking_date DESC, t.\`start\``))[0]);
  }));

  app.put('/api/admin/bookings/:id', wrap(async (req, res) => {
    const { fid, tid, cid, booking_date } = req.body || {};
    if (!fid || !tid || !booking_date) return res.status(400).json({ error: 'Facility, time slot and date are required.' });
    await pool.query('UPDATE Bookings SET fid=?, tid=?, cid=?, booking_date=? WHERE bid=?',
      [fid, tid, cid || null, booking_date, req.params.id]);
    res.json({ ok: true });
  }));

  app.delete('/api/admin/bookings/:id', wrap(async (req, res) => {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      // put used equipment back into stock, then remove the booking
      await c.query(`UPDATE EquipmentInventory e
                     JOIN (SELECT eid, SUM(quantity_used) q FROM EquipmentUsage WHERE bid = ? GROUP BY eid) u ON u.eid = e.eid
                     SET e.quantity = e.quantity + u.q`, [req.params.id]);
      await c.query('DELETE FROM EquipmentUsage WHERE bid = ?', [req.params.id]);
      await c.query('DELETE FROM Bookings WHERE bid = ?', [req.params.id]);
      await c.commit(); res.json({ ok: true });
    } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
  }));

  // ---- generic add / edit / delete / list ----
  const cfg = (req, res) => T[req.params.t] || (res.status(404).json({ error: 'Unknown table' }), null);
  const vals = (c, b) => c.c.map(k => NUM.includes(k) ? Number(b[k]) : String(b[k] ?? '').trim());
  const bad = (c, v, t) => v.some(x => x === '' || Number.isNaN(x)) || (t === 'timeslots' && !(v[1] > v[0])) ||
    (t === 'users' && !/^\d{10}$/.test(v[1])) || (t === 'equipment' && v[1] < 0);
  const cols = c => c.c.map(k => '`' + k + '`');

  app.get('/api/admin/:t', wrap(async (req, res) => {
    const c = cfg(req, res); if (!c) return;
    res.json((await pool.query(`SELECT * FROM ${c.t} ORDER BY ${c.pk}`))[0]);
  }));
  app.post('/api/admin/:t', wrap(async (req, res) => {
    const c = cfg(req, res); if (!c) return;
    const v = vals(c, req.body || {});
    if (bad(c, v, req.params.t)) return res.status(400).json({ error: 'Please fill every field with valid values.' });
    const [r] = await pool.query(`INSERT INTO ${c.t} (${cols(c).join(',')}) VALUES (${v.map(() => '?').join(',')})`, v);
    res.status(201).json({ id: r.insertId });
  }));
  app.put('/api/admin/:t/:id', wrap(async (req, res) => {
    const c = cfg(req, res); if (!c) return;
    const v = vals(c, req.body || {});
    if (bad(c, v, req.params.t)) return res.status(400).json({ error: 'Please fill every field with valid values.' });
    await pool.query(`UPDATE ${c.t} SET ${cols(c).map(x => x + '=?').join(',')} WHERE ${c.pk}=?`, [...v, req.params.id]);
    res.json({ ok: true });
  }));
  app.delete('/api/admin/:t/:id', wrap(async (req, res) => {
    const c = cfg(req, res); if (!c) return;
    await pool.query(`DELETE FROM ${c.t} WHERE ${c.pk}=?`, [req.params.id]);
    res.json({ ok: true });
  }));
};
module.exports.guard = guard;
