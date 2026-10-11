import "dotenv/config";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { adminRouter } from "./routes/admin";
import { residentRouter } from "./routes/resident";

const app = express();
const port = Number(process.env.PORT) || 3001;
const isProduction = process.env.NODE_ENV === "production";

// Behind the host's proxy in production; needed so rate limiting sees the client IP.
if (isProduction) app.set("trust proxy", 1);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/admin", adminRouter);
app.use("/api", residentRouter);

if (isProduction) {
  const clientDist = path.resolve(import.meta.dirname, "../../client/dist");

  app.use(express.static(clientDist));

  // SPA fallback: anything that is not an API route gets index.html.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Return JSON instead of Express's HTML error page.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const badJson = err instanceof SyntaxError;
  if (!badJson) console.error(err);
  res.status(badJson ? 400 : 500).json({ error: badJson ? "Invalid JSON body" : "Internal server error" });
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
