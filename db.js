const { Pool } = require("pg");

// Use SSL only on Heroku (or when explicitly asked)
const useSSL =
  process.env.NODE_ENV === "production" ||
  (process.env.DATABASE_URL || "").includes("herokuapp") ||
  process.env.PGSSLMODE === "require";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false
});

module.exports = { pool };
