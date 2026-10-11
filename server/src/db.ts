import pg from "pg";

// Return DATE columns as "YYYY-MM-DD" strings instead of JS Dates in local time.
pg.types.setTypeParser(1082, (value) => value);

// Neon needs SSL
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
