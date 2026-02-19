/**
 * Holi Registration + QR + Check-in (Heroku ready)
 */
require("dotenv").config(); // loads .env locally; ignored on Heroku unless provided

const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const { pool } = require("./db");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// ----- Config -----
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

// ----- Helpers -----
function signQrToken(regId) {
  // JWT: short + tamper-proof
  return jwt.sign({ rid: regId }, JWT_SECRET, { expiresIn: "365d" });
}

function verifyQrToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function requireAdmin(req, res, next) {
  const session = req.cookies.admin_session;
  if (!session) return res.redirect("/admin/login");
  try {
    jwt.verify(session, JWT_SECRET);
    return next();
  } catch {
    return res.redirect("/admin/login");
  }
}

async function getCapacityLimit() {
  const r = await pool.query(`SELECT value FROM app_settings WHERE key='capacity_limit'`);
  return r.rowCount ? Number(r.rows[0].value) : 300;
}

async function setCapacityLimit(n) {
  await pool.query(
    `INSERT INTO app_settings(key, value)
     VALUES ('capacity_limit', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(n)]
  );
}


// ----- Views -----
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "views/register.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "views/register.html")));

app.post("/register", async (req, res) => {
  const {
    family_name,
    primary_contact_name,
    phone,
    email,
    adults = 0,
    kids = 0,
    notes
  } = req.body;

  if (!family_name || !primary_contact_name || !phone) {
    return res.status(400).send("Missing required fields.");
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO registrations
        (family_name, primary_contact_name, phone, email, adults, kids, notes)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
      `,
      [
        family_name.trim(),
        primary_contact_name.trim(),
        phone.trim(),
        email ? email.trim() : null,
        Number(adults) || 0,
        Number(kids) || 0,
        notes ? notes.trim() : null
      ]
    );

    const regId = result.rows[0].id;
    const token = signQrToken(regId);

    // Keep QR content minimal: token only
    const qrPngDataUrl = await QRCode.toDataURL(token, { margin: 1, scale: 8 });

    const html = fs
      .readFileSync(path.join(__dirname, "views/success.html"), "utf-8")
      .replaceAll("{{REG_ID}}", String(regId))
      .replaceAll("{{QR_DATA_URL}}", qrPngDataUrl);

    res.send(html);
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error creating registration.");
  }
});

// ----- Admin Login -----
app.get("/admin/login", (req, res) => res.sendFile(path.join(__dirname, "views/admin-login.html")));

app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).send("Invalid password.");

  const session = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: "7d" });

  res.cookie("admin_session", session, {
    httpOnly: true,
    sameSite: "lax",
    secure: !!process.env.DATABASE_URL // on heroku (https) => true
  });

  res.redirect("/admin/checkin");
});

app.get("/admin/logout", (req, res) => {
  res.clearCookie("admin_session");
  res.redirect("/admin/login");
});

// ----- Admin pages -----
app.get("/admin/checkin", requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "views/checkin.html"))
);

app.get("/admin/dashboard", requireAdmin, (req, res) =>
  res.sendFile(path.join(__dirname, "views/dashboard.html"))
);

// ----- API: Check-in -----
app.post("/api/checkin", requireAdmin, async (req, res) => {
  const { qrText } = req.body;
  if (!qrText) return res.status(400).json({ ok: false, message: "Missing qrText" });

  let decoded;
  try {
    decoded = verifyQrToken(qrText);
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid / tampered QR code" });
  }

  const regId = decoded.rid;

  try {
    const found = await pool.query(
      `SELECT id, family_name, primary_contact_name, checked_in, checked_in_at, adults, kids, phone, email
       FROM registrations WHERE id = $1`,
      [regId]
    );

    if (found.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "Registration not found" });
    }

    const r = found.rows[0];
    if (r.checked_in) {
      return res.json({
        ok: true,
        status: "already",
        message: `Already checked in: \${r.family_name} (ID \${r.id})`,
        registration: r
      });
    }

    const cap = await getCapacityLimit();
    const checked = await pool.query(`SELECT COUNT(*)::int AS c FROM registrations WHERE checked_in = TRUE`);
    const checkedInCount = checked.rows[0].c;

    if (checkedInCount >= cap) {
      return res.json({
        ok: true,
        status: "locked",
        message: `Entry is locked (capacity reached: ${cap}). Ask admin to increase limit if needed.`,
        stats: { checkedIn: checkedInCount, capacityLimit: cap }
      });
    }

    const updated = await pool.query(
      `UPDATE registrations
       SET checked_in = TRUE, checked_in_at = NOW()
       WHERE id = $1
       RETURNING id, family_name, primary_contact_name, checked_in, checked_in_at, adults, kids, phone, email`,
      [regId]
    );

    return res.json({
      ok: true,
      status: "checked_in",
      message: `Checked in: \${updated.rows[0].family_name} (ID \${updated.rows[0].id})`,
      registration: updated.rows[0]
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: "Server error during check-in" });
  }
});

// ----- API: Search registrations (name/phone/id) -----
app.get("/api/registrations/search", requireAdmin, async (req, res) => {
  const q = (req.query.q || "").toString().trim();
  if (!q) return res.json({ ok: true, results: [] });

  // If numeric, allow direct ID lookup
  const id = Number(q);
  const isId = Number.isInteger(id) && id > 0;

  try {
    const results = await pool.query(
      `
      SELECT id, family_name, primary_contact_name, phone, email, adults, kids, checked_in, checked_in_at, created_at
      FROM registrations
      WHERE
        ($1::boolean AND id = $2)
        OR family_name ILIKE $3
        OR primary_contact_name ILIKE $3
        OR phone ILIKE $3
        OR COALESCE(email,'') ILIKE $3
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [isId, isId ? id : 0, `%${q}%`]
    );

    res.json({ ok: true, results: results.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "Search failed" });
  }
});

// ----- API: Undo check-in -----
app.post("/api/registrations/undo-checkin", requireAdmin, async (req, res) => {
  const id = Number(req.body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, message: "Invalid id" });
  }

  try {
    const updated = await pool.query(
      `
      UPDATE registrations
      SET checked_in = FALSE, checked_in_at = NULL
      WHERE id = $1
      RETURNING id, family_name, primary_contact_name, checked_in, checked_in_at
      `,
      [id]
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ ok: false, message: "Registration not found" });
    }

    res.json({ ok: true, registration: updated.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "Undo failed" });
  }
});

app.get("/api/stats", requireAdmin, async (req, res) => {
  try {
    const cap = await getCapacityLimit();
    const checked = await pool.query(`SELECT COUNT(*)::int AS c FROM registrations WHERE checked_in = TRUE`);
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM registrations`);

    const checkedIn = checked.rows[0].c;
    const totalRegs = total.rows[0].c;

    res.json({
      ok: true,
      checkedIn,
      totalRegs,
      capacityLimit: cap,
      locked: checkedIn >= cap
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "Stats failed" });
  }
});

app.post("/api/settings/capacity", requireAdmin, async (req, res) => {
  const n = Number(req.body.capacityLimit);
  if (!Number.isFinite(n) || n < 1 || n > 100000) {
    return res.status(400).json({ ok: false, message: "Invalid capacityLimit" });
  }

  try {
    await setCapacityLimit(Math.floor(n));
    res.json({ ok: true, capacityLimit: Math.floor(n) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "Failed to update capacity" });
  }
});


// ----- Health -----
app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`✅ Running on port ${PORT}`);
});
