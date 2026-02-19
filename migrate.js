require("dotenv").config();
const { pool } = require("./db");

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        id SERIAL PRIMARY KEY,
        family_name TEXT NOT NULL,
        primary_contact_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        adults INT NOT NULL DEFAULT 0,
        kids INT NOT NULL DEFAULT 0,
        notes TEXT,
        checked_in BOOLEAN NOT NULL DEFAULT FALSE,
        checked_in_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_registrations_checked_in ON registrations(checked_in);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_registrations_family_name ON registrations(family_name);
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_registrations_phone ON registrations(phone);
    `);

    console.log("✅ Migration complete");
    process.exit(0);
  } catch (e) {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  }
})();
