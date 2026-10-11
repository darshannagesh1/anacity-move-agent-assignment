import pg from "pg";

// Return DATE columns as "YYYY-MM-DD" strings instead of JS Dates in local time.
pg.types.setTypeParser(1082, (value) => value);

const url = process.env.DATABASE_URL ?? "";

// Neon needs SSL; the local postgres container (host "postgres") and localhost don't speak it
function needsSsl(): boolean {
  if (url.includes("sslmode=require")) return true;
  try {
    const { hostname } = new URL(url);
    return hostname !== "postgres" && hostname !== "localhost";
  } catch {
    return true;
  }
}

export const pool = new pg.Pool({
  connectionString: url,
  ssl: needsSsl() ? { rejectUnauthorized: false } : false,
});
