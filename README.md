# anacity-move-agent

Move-in / move-out agentic workflow for residential communities.

- `server/`: Node 20 + Express + TypeScript (run directly with `tsx`, no build step)
- `client/`: React + TypeScript + Vite + Tailwind

## Prerequisites

- Node 20.11 or newer
- A Postgres database (Neon) and an OpenAI API key

## Local setup

1. Install dependencies:

   ```sh
   cd server && npm install
   cd ../client && npm install
   ```

2. Create the server env file and fill in the values:

   ```sh
   cd server
   cp .env.example .env
   ```

   | Variable         | Description                         |
   | ---------------- | ----------------------------------- |
   | `OPENAI_API_KEY` | OpenAI API key                      |
   | `OPENAI_MODEL`   | Model name, defaults to gpt-4o-mini |
   | `DATABASE_URL`   | Neon Postgres connection string     |
   | `PORT`           | Server port, defaults to 3001       |

3. Start the server (terminal 1), on http://localhost:3001:

   ```sh
   cd server
   npm run dev
   ```

4. Start the client (terminal 2), on http://localhost:5173:

   ```sh
   cd client
   npm run dev
   ```

   The Vite dev server proxies `/api` to the server, so the page should show `{"ok":true}` from `/api/health`.

## Other commands

Run from `server/`:

- `npm test`: run tests with Vitest
- `npm run typecheck`: type check with `tsc --noEmit`

## Production

From the repo root:

```sh
npm run build   # installs and builds the client, installs server deps
npm start       # serves the API and client/dist from one process
```

`npm start` sets `NODE_ENV` with POSIX shell syntax, so on Windows run it from Git Bash or WSL.
