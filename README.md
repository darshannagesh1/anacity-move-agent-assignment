# ANACITY Move Assistant

A move-in / move-out assistant for residential communities. A resident plans a move by chatting with an AI agent, a rule engine checks the request against that community's rules, and an admin decides with an AI-written assessment to help.

- **Live:** https://anacity-move-agent-assignment-1.onrender.com/
- **How it works and why:** [docs/EXPLANATION.md](docs/EXPLANATION.md)
- **Agent evals:** [docs/EVALS.md](docs/EVALS.md)

The live app is on a free tier, so the first load after a quiet period takes about 50 seconds while the server wakes up.

## Try it

No login. Pick a persona on the home page.

**As a resident**
1. Choose Green Meadows and Priya Sharma, then start a new request.
2. Type something like "I'm a tenant moving into A-101 next Saturday afternoon, 3 of us".
3. Watch the panel on the right fill in. Upload the four documents with the buttons there (any file works, only the name is recorded).
4. Press Submit when the checklist is complete.

**As an admin**
1. Go back to the home page, choose Admin and Green Meadows.
2. Open the request. Read the agent's assessment, then approve, reject or request info.

**Things worth trying**
- A date that breaks the rules: "tomorrow", or a Sunday in Green Meadows.
- The same request in Lakeview Residency (try Rohan Mehta). It has shorter notice, Sunday moves, and asks about pets.
- A move-out from flat B-102 in Green Meadows, which has pending dues.
- Request info as admin, then reopen the request as the resident and resubmit.

## Run locally with npm

Needs Node 22 or newer, a Postgres database (Neon works) and an OpenAI API key.

```sh
cd server
npm install
cp .env.example .env      # fill in OPENAI_API_KEY and DATABASE_URL
npm run db:setup          # creates tables and demo data, wipes existing data
npm run dev               # API on http://localhost:3001
```

In a second terminal:

```sh
cd client
npm install
npm run dev               # app on http://localhost:5173
```

## Run locally with Docker

Starts the app and its own Postgres. Nothing else to install.

```sh
cp .env.example .env      # in the repo root, add your OPENAI_API_KEY
docker compose up --build
```

In a second terminal, on the first run:

```sh
docker compose exec app npm run db:setup
```

Then open http://localhost:3001.

## Tests and evals

Run from `server/`:

```sh
npm test                      # unit tests
npm run typecheck
npm run eval -- --repeat 3    # agent evals, calls OpenAI and uses temporary data
```
