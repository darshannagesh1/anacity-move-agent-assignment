# ANACITY Move Assistant: explanation

## 1. Overview

A resident plans a move-in or move-out by chatting with an AI assistant. The assistant collects the details, a rule engine checks them against that community's rules, and an admin makes the final decision with an AI-written assessment to help.

- Live: [<LIVE_URL>](https://anacity-move-agent-assignment-1.onrender.com/)
- Repo: [<REPO_URL>](https://github.com/darshannagesh1/anacity-move-agent-assignment)
- Personas to try (no login, pick them on the home page):
  - Green Meadows, strict rules: Priya Sharma, Arjun Nair, Kavya Rao. Flat B-102 has pending dues, which is useful for a move-out.
  - Lakeview Residency, relaxed rules: Rohan Mehta, Sneha Pillai, Aditya Joshi.
  - Admin: pick either community.

## 2. Problem and experience

**Residents need**
- To know what is required without reading a policy document.
- To give details in their own words, a few at a time.
- Clear reasons when a date or slot does not work, with alternatives.
- To see where their request stands.

**Admins need**
- A queue that shows what needs attention first.
- The facts and the rule results in one place.
- A quick read on risk, and a draft message when they send a request back.
- The final say.

**Communities differ in**
- Notice period and the days moves are allowed.
- Time slots and how many moves fit in each.
- Required documents and fees, which also differ for owners and tenants.
- Extra questions, such as pets or vehicle number.

**Resident flow**
- Chat with the assistant. It saves each detail as it is given.
- A panel beside the chat shows the request, a checklist, documents, fees and a timeline. It updates live.
- Upload documents with buttons in the panel.
- Press Submit when the checklist is complete. The server re-checks every rule first.
- Track the status and any note from the admin in the same place.

**Admin flow**
- A queue with tabs by status. Each card shows a risk badge and the agent's recommendation.
- A detail page with the request, checklist, chat transcript and the agent's assessment.
- Approve, reject, or request info. The last two need a note, pre-filled from the agent's draft.
- A box to ask the agent a question about the request.

**Status flow**

```
draft -> submitted -> approved
              |    -> rejected
              v
        info_requested -> (resident fixes and resubmits) -> submitted
```

## 3. Architecture

```
React (Vite)
    |  JSON, and SSE for chat
    v
Express routes
    |-- resident agent loop <----> OpenAI
    |       |-- 4 tools
    |-- admin assessment    <----> OpenAI
    v
evaluation service
    |-- rule engine (pure functions, no I/O)
    |-- repo (all SQL) --> Postgres
```

Stack: React + TypeScript, Node + Express + TypeScript, Postgres (Neon), OpenAI gpt-4.1-mini (set with `OPENAI_MODEL`; the code default is gpt-4o-mini), SSE streaming, Docker on Render.

## 4. Agent design

**Resident agent.** A tool-calling loop. The model can call four tools:
- `get_policy`: the rules, documents and fees that apply to this request.
- `update_request`: save details. Returns what is still missing or failing.
- `check_slot_availability`: free slots on a date, and whether the date is allowed.
- `get_request_status`: current fields, open items, and whether it can be submitted.

**Admin assessment.** One call that returns strict JSON: summary, risk level, risks, recommendation, reasoning, and a draft message to the resident.

**Key principle.** Rules are checked in code. The LLM handles conversation and judgment.

**Autonomy**
- The agent guides and recommends.
- Code checks every rule.
- The resident submits. The admin decides.
- The agent has no tool to submit or approve, so it cannot do either.

**Guardrails in code**
- Tools never take a community or request id. The server supplies both.
- A slot that is already full is not saved. The tool returns the free slots instead.
- An "approve" recommendation is changed to "request info" if any blocking check is not passing.
- The prompt includes a 3-week calendar, so the model looks dates up and does not calculate them.
- Every tool input is validated with Zod, and "3" or "true" is converted to the right type.
- Tool errors go back to the model as data, so it can correct itself.
- At most 6 model rounds per message, and 20 chat requests per minute per IP.

## 5. Scalability

- Each community's rules are one JSON config row in Postgres: documents, fees, notice period, allowed days, slots, capacity per slot, and extra fields.
- A new community is a new row. No code change and no deploy.
- The two demo communities run on the same code with different configs.
- The config has an `autoApproveWhenAllChecksPass` flag. It is off for both communities and no code acts on it yet. It marks how autonomy could grow one community at a time.

## 6. Assumptions

| Assumption in this build | In production |
|---|---|
| Demo personas, no login | Real authentication, and ownership checks on every route |
| Uploads record only the file name | File storage, type and size limits, content checks |
| One admin approval step | Configurable steps, such as security or accounts |
| All dates are in IST | Timezone stored per community |
| Status is shown in the app | Notifications by SMS, email or WhatsApp |
| Fees are shown, not collected | Payment collection and receipts |

## 7. Decisions

- **No LangChain.** The loop is about 100 lines. Writing it myself let me control exactly when messages are saved.
- **No RAG.** The policy for one community is small and structured. A tool returns exactly the rules that apply.
- **Raw SQL in one repo file.** There are about 25 queries. SQL is clearer than an ORM here, mainly for the JSON columns.
- **SSE over WebSockets.** A reply flows one way, server to browser. SSE is plain HTTP and needs no extra infrastructure.
- **Notice period judged at the submission date.** A resident who gave enough notice should not fail because the admin took two days to review.

## 8. Testing

- 19 unit tests: 16 for the rule engine, 3 for the IST date handling.
- An agent eval suite with 9 scenarios. It runs real conversations against OpenAI, in temporary copies of the communities that are deleted afterwards. A `--repeat` flag runs each scenario several times, because model output varies.
- Results: gpt-4.1-mini passes 85 to 89% across the last three full runs (9 scenarios x 3 repeats). Details are in [EVALS.md](EVALS.md).

Issues the evals and manual testing found, and what I did:
- **Wrong weekday for dates like "next Saturday".** Added the calendar to the prompt and the weekday to tool results.
- **Slot changed without consent.** When the chosen slot was full, the agent saved a different one. The tool now refuses a full slot, and the prompt tells the agent to wait for the resident to pick.
- **Saying "noted" without saving.** Added a prompt rule that it may only claim a save after the tool succeeded in that turn.
- **Markdown symbols in replies.** The prompt alone did not stop them, so the client strips them before display.

## 9. Limitations and next steps

**Limitations**
- **Slot race condition.** Two requests submitted at the same moment can both take the last slot. The fix is to lock the slot inside one transaction.
- **No authentication.** Anyone can open any request by its id.
- **Documents are mocked.** A file name counts as an upload.
- **Crash recovery is partial.** An assistant message and its tool results are saved together, so a crash cannot corrupt the chat history. But the turn in progress is lost and the resident has to resend.

**Next steps for production**
- Authentication and per-resident access checks.
- Real uploads with OCR, so documents can be checked and not only counted.
- Notifications when the status changes.
- Evals in CI, so a prompt change that lowers the pass rate blocks the merge.
- Observability: token use, latency and tool errors per conversation.
