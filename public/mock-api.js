/* DEMO MODE: stands in for the real server so the pages work with no backend.
   It answers the same /api/... routes as server.js + admin.js, using your TurfManagerSystem data and rules.
   To go live, delete the <script src="mock-api.js"></script> line from index.html and admin.html. */
(function () {
  var KEY = "turfbook_mock_db_v1";
  var p2 = function (n) { return String(n).padStart(2, "0"); };
  var today = function () { var d = new Date(); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); };
  var O = function (k, rows) { return rows.map(function (r) { var o = {}; k.forEach(function (x, i) { o[x] = r[i]; }); return o; }); };

  // Exactly your seed data (after the triggers ran) with the dates schema-fix.sql gives existing bookings (today).
  function seed() {
    var t = today(), ts = [];
    for (var i = 0; i < 12; i++) ts.push({ tid: i + 1, start: 10 + i, end: 11 + i });
    return {
      users: O(["uid", "name", "phone"], [[1, "Rahul Sharma", "9876543210"], [2, "Priya Mehta", "9123456780"], [3, "Amit Verma", "9988776655"], [4, "Sneha Iyer", "9012345678"], [5, "Karan Singh", "9345678901"], [6, "Neha Kapoor", "9456123780"]]),
      facilities: O(["fid", "fsport", "fname"], [[1, "Football", "Turf A"], [2, "Cricket", "Turf B"], [3, "Badminton", "Court 1"], [4, "Tennis", "Court 2"], [5, "Basketball", "Court 3"]]),
      timeslots: ts,
      coaches: O(["cid", "name", "phone"], [[1, "Suresh Patil", "9800011111"], [2, "Anita Desai", "9800022222"], [3, "Vikram Rao", "9800033333"], [4, "Meera Nair", "9800044444"]]),
      equipment: O(["eid", "item", "quantity", "fid"], [[1, "Football", 8, 1], [2, "Training Cones", 30, 1], [3, "Cricket Bat", 7, 2], [4, "Cricket Ball", 20, 2], [5, "Badminton Racket", 8, 3], [6, "Shuttlecock Box", 4, 3], [7, "Tennis Racket", 6, 4], [8, "Tennis Ball Can", 12, 4], [9, "Basketball", 8, 5]]),
      bookings: O(["bid", "uid", "fid", "cid", "tid", "booking_date", "eq"], [[1, 1, 1, 1, 1, t, []], [2, 2, 3, 2, 2, t, []], [3, 3, 2, null, 3, t, []], [4, 4, 4, 3, 5, t, []], [5, 5, 5, null, 8, t, []], [6, 1, 1, null, 9, t, []], [7, 6, 3, 2, 10, t, []], [8, 2, 2, 1, 11, t, []]])
    };
  }
  var db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  if (!db || !db.bookings) { db = seed(); save(); }

  var by = function (t, k, v) { return db[t].find(function (x) { return x[k] == v; }); };
  var nid = function (t, k) { return Math.max.apply(null, [0].concat(db[t].map(function (x) { return x[k]; }))) + 1; };
  var fail = function (s, m) { throw { s: s, m: m }; };
  var INVALID = "Pick a valid facility, slot, coach or user.", FILL = "Please fill every field with valid values.", DUP = "Duplicate value: that name, phone or slot already exists.";

  var T = {
    facilities: { pk: "fid", c: ["fsport", "fname"] }, timeslots: { pk: "tid", c: ["start", "end"] },
    coaches: { pk: "cid", c: ["name", "phone"] }, equipment: { pk: "eid", c: ["item", "quantity", "fid"] }, users: { pk: "uid", c: ["name", "phone"] }
  };
  var NUM = ["start", "end", "quantity", "fid"];
  var USE = {
    facilities: function (i) { return db.bookings.some(function (b) { return b.fid == i; }) || db.equipment.some(function (e) { return e.fid == i; }); },
    timeslots: function (i) { return db.bookings.some(function (b) { return b.tid == i; }); },
    coaches: function (i) { return db.bookings.some(function (b) { return b.cid == i; }); },
    equipment: function (i) { return db.bookings.some(function (b) { return b.eq.some(function (x) { return x[0] == i; }); }); },
    users: function (i) { return db.bookings.some(function (b) { return b.uid == i; }); }
  };

  function conflict(n, skip) { // UNIQUE(fid,date,tid) and UNIQUE(cid,date,tid)
    var o = db.bookings.filter(function (x) { return x.bid !== skip && x.booking_date === n.booking_date && x.tid === n.tid; });
    if (o.some(function (x) { return x.fid === n.fid; })) fail(409, "Facility is already booked for this time slot");
    if (n.cid && o.some(function (x) { return x.cid === n.cid; })) fail(409, "That coach is already booked at this time. Pick another coach or none.");
  }
  function book(b) {
    var name = String(b.name || "").trim(), phone = String(b.phone || "");
    if (!name || name.length > 50 || !/^\d{10}$/.test(phone) || !b.fid || !b.tid || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || ""))
      fail(400, "Check your name, 10-digit phone number, facility, date and time slot.");
    if (!by("facilities", "fid", b.fid) || !by("timeslots", "tid", b.tid) || (b.cid && !by("coaches", "cid", b.cid))) fail(400, INVALID);
    var n = { fid: +b.fid, tid: +b.tid, cid: b.cid ? +b.cid : null, booking_date: b.date };
    conflict(n, 0);
    var cnt = {};
    (b.equipment || []).forEach(function (e) { cnt[e] = (cnt[e] || 0) + 1; });
    Object.keys(cnt).forEach(function (e) {
      var q = by("equipment", "eid", e);
      if (!q) fail(400, INVALID);
      if (q.quantity < cnt[e]) fail(409, "Not enough equipment available");
    });
    var u = db.users.find(function (x) { return x.phone === phone; });
    if (!u) { u = { uid: nid("users", "uid"), name: name, phone: phone }; db.users.push(u); }
    Object.keys(cnt).forEach(function (e) { by("equipment", "eid", e).quantity -= cnt[e]; });
    n.bid = nid("bookings", "bid"); n.uid = u.uid;
    n.eq = Object.keys(cnt).map(function (e) { return [+e, cnt[e]]; });
    db.bookings.push(n); save();
    return [201, { bid: n.bid }];
  }
  function adminRow(b) {
    var u = by("users", "uid", b.uid), f = by("facilities", "fid", b.fid), t = by("timeslots", "tid", b.tid), c = by("coaches", "cid", b.cid);
    return {
      bid: b.bid, uid: b.uid, fid: b.fid, tid: b.tid, cid: b.cid, booking_date: b.booking_date, username: u.name, phone: u.phone,
      facility: f.fname, start: t.start, end: t.end, coach: c ? c.name : null,
      equipment: b.eq.length ? b.eq.map(function (x) { return x[1] + " x " + by("equipment", "eid", x[0]).item; }).join(", ") : null
    };
  }
  function clean(k, b) {
    var row = {};
    T[k].c.forEach(function (n) {
      var v = NUM.indexOf(n) > -1 ? Number(b[n]) : String(b[n] == null ? "" : b[n]).trim();
      if (v === "" || v !== v || (typeof v === "string" && v.length > 50)) fail(400, FILL);
      row[n] = v;
    });
    if (k === "timeslots" && !(row.end > row.start)) fail(400, FILL);
    if (k === "users" && !/^\d{10}$/.test(row.phone)) fail(400, FILL);
    if (k === "equipment") { if (row.quantity < 0) fail(400, FILL); if (!by("facilities", "fid", row.fid)) fail(400, INVALID); }
    return row;
  }
  function dupe(k, row, id) {
    var u = { equipment: "item", users: "phone" }[k];
    if (u && db[k].some(function (x) { return x[u] === row[u] && x[T[k].pk] != id; })) fail(409, DUP);
  }
  function admin(method, seg, body) {
    var r = seg[0], id = seg[1];
    if (r === "bookings") {
      if (method === "GET") return [200, db.bookings.map(adminRow).sort(function (a, b) { return b.booking_date.localeCompare(a.booking_date) || a.start - b.start; })];
      var b = by("bookings", "bid", id); if (!b) fail(404, "Booking not found");
      if (method === "PUT") {
        if (!body.fid || !body.tid || !body.booking_date) fail(400, "Facility, time slot and date are required.");
        var n = { fid: +body.fid, tid: +body.tid, cid: body.cid ? +body.cid : null, booking_date: body.booking_date };
        if (!by("facilities", "fid", n.fid) || !by("timeslots", "tid", n.tid) || (n.cid && !by("coaches", "cid", n.cid))) fail(400, INVALID);
        conflict(n, b.bid); Object.assign(b, n); save(); return [200, { ok: true }];
      }
      if (method === "DELETE") { // equipment used goes back into stock
        b.eq.forEach(function (x) { by("equipment", "eid", x[0]).quantity += x[1]; });
        db.bookings = db.bookings.filter(function (x) { return x !== b; }); save(); return [200, { ok: true }];
      }
    }
    var c = T[r]; if (!c) fail(404, "Unknown table");
    if (method === "GET") return [200, db[r].slice().sort(function (a, b) { return a[c.pk] - b[c.pk]; })];
    if (method === "POST") { var row = clean(r, body); dupe(r, row, 0); var o = {}; o[c.pk] = nid(r, c.pk); Object.keys(row).forEach(function (k) { o[k] = row[k]; }); db[r].push(o); save(); return [201, { id: o[c.pk] }]; }
    var cur = by(r, c.pk, id); if (!cur) fail(404, "Not found");
    if (method === "PUT") { var nr = clean(r, body); dupe(r, nr, id); Object.assign(cur, nr); save(); return [200, { ok: true }]; }
    if (method === "DELETE") {
      if (USE[r](id)) fail(409, "This is used by existing bookings or equipment. Remove those first.");
      db[r] = db[r].filter(function (x) { return x !== cur; }); save(); return [200, { ok: true }];
    }
    fail(404, "Not found");
  }
  function route(method, url, body) {
    var m = url.match(/\/api\/([^?]*)(?:\?(.*))?$/), seg = m[1].split("/"), q = new URLSearchParams(m[2] || "");
    if (seg[0] === "admin") { seg.shift(); return admin(method, seg, body); }
    var r = seg[0];
    if (method === "GET") {
      if (r === "facilities") return [200, db.facilities.map(function (f) { return { Fid: f.fid, fname: f.fname, fsport: f.fsport }; })];
      if (r === "timeslots") return [200, db.timeslots.slice().sort(function (a, b) { return a.tid - b.tid; })];
      if (r === "coaches") return [200, db.coaches];
      if (r === "equipment") return [200, db.equipment.map(function (e) { return { Eid: e.eid, Fid: e.fid, item: e.item, quant: e.quantity }; })];
      if (r === "availability") return [200, db.bookings.filter(function (b) { return b.fid == q.get("fid") && b.booking_date === q.get("date"); }).map(function (b) { return b.tid; })];
      if (r === "bookings") return [200, db.bookings.slice().sort(function (a, b) { return b.bid - a.bid; }).slice(0, 50).map(function (b) {
        var x = adminRow(b); return { bid: x.bid, username: x.username[0] + "***", facility: x.facility, booking_date: x.booking_date, start: x.start, end: x.end, coach: x.coach };
      })];
    }
    if (method === "POST" && r === "bookings") return book(body);
    fail(404, "Not found");
  }

  var real = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    var u = String((url && url.url) || url);
    if (u.indexOf("/api/") < 0) return real(url, opts);
    var res;
    try { res = route((opts && opts.method) || "GET", u, opts && opts.body ? JSON.parse(opts.body) : {}); }
    catch (e) { if (e && e.s) res = [e.s, { error: e.m }]; else { console.error(e); res = [500, { error: "Server error" }]; } }
    return Promise.resolve(new Response(JSON.stringify(res[1]), { status: res[0], headers: { "Content-Type": "application/json" } }));
  };

  function banner() {
    var d = document.createElement("div"), s = document.createElement("style"), top = window.self === window.top;
    s.textContent = "#demoBar{position:fixed;left:10px;bottom:10px;z-index:9;background:#12352a;color:#fff;font:500 12px/1.4 system-ui,sans-serif;padding:8px 12px;border-radius:999px;display:flex;gap:10px;align-items:center;opacity:.93}#demoBar a{color:#bfeacd}#demoBar button{font:inherit;background:#bfeacd;color:#12352a;border:0;border-radius:999px;padding:2px 10px;cursor:pointer}@media(max-width:860px){#demoBar{bottom:72px}}";
    d.id = "demoBar";
    d.innerHTML = "<span>Demo mode · saved in this browser</span>" + (top ? '<a href="index.html">Booking</a><a href="admin.html">Admin</a>' : "") + '<button type="button">Reset data</button>';
    d.querySelector("button").onclick = function () { if (confirm("Reset all demo data?")) { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); } };
    document.head.appendChild(s); document.body.appendChild(d);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", banner); else banner();
})();
