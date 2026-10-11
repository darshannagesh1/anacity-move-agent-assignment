import OpenAI from "openai";
import { buildAssessmentContext } from "./assessment";

const client = new OpenAI();
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const SYSTEM = `You answer a community admin's question about one move-in or move-out request.
Answer from the JSON context only. If the context does not contain the answer, say you do not know.
Plain text only, no markdown. 3 sentences at most.`;

export async function askAboutRequest(requestId: number, question: string): Promise<string> {
  const { context } = await buildAssessmentContext(requestId);
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Context:\n${JSON.stringify(context)}\n\nQuestion: ${question}` },
    ],
  });
  return res.choices[0].message.content?.trim() || "I could not find an answer to that.";
}
