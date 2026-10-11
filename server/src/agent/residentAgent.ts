import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { toolDefinitions, runTool } from "./tools";
import { buildSystemPrompt } from "./prompt";
import { getMessages, appendMessage, appendMessages } from "../repo";
import type { SseSend } from "../lib/sse";
const client = new OpenAI();                         // reads OPENAI_API_KEY
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_ROUNDS = 6;                                // safety cap on tool loops

export async function runResidentAgent(opts: {
  requestId: number;
  communityId: string;
  userMessage: string;
  send: SseSend;
}) {
  const { requestId, communityId, userMessage, send } = opts;
  const ctx = { requestId, communityId };            // injected into every tool, never from the model

  await appendMessage(requestId, { role: "user", content: userMessage });
  const history: ChatCompletionMessageParam[] = await getMessages(requestId);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // rebuilt every round: a tool may have just changed the request
    const system = await buildSystemPrompt(requestId);
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...history,
    ];

    const stream = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: toolDefinitions,
      temperature: 0.3,
      stream: true,
    });

    let content = "";
    const toolCalls: { id: string; name: string; args: string }[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        send("token", { text: delta.content });
      }

      // tool call arguments stream as JSON fragments; stitch them by index
      for (const tc of delta.tool_calls ?? []) {
        const call = (toolCalls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name += tc.function.name;
        if (tc.function?.arguments) call.args += tc.function.arguments;
      }
    }

    // saved together with its tool results below, never on its own
    const assistantMsg: ChatCompletionMessageParam = {
      role: "assistant",
      content: content || null,
      ...(toolCalls.length
        ? {
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.args },
            })),
          }
        : {}),
    };
    history.push(assistantMsg);

    // no tool calls = final answer
    if (toolCalls.length === 0) {
      await appendMessages(requestId, [assistantMsg]);
      send("done", {});
      return;
    }

    const toolMsgs: ChatCompletionMessageParam[] = [];
    for (const tc of toolCalls) {
      send("tool", { name: tc.name });
      const outcome = await runTool(tc.name, tc.args, ctx);
      const toolMsg: ChatCompletionMessageParam = {
        role: "tool",
        tool_call_id: tc.id,                         // links the result to the call
        content: JSON.stringify(outcome.result),
      };
      history.push(toolMsg);
      toolMsgs.push(toolMsg);
      if (outcome.requestChanged) send("request_updated", {});
    }
    await appendMessages(requestId, [assistantMsg, ...toolMsgs]);
  }

  // hit the round cap without a final answer
  send("token", { text: "Sorry, I couldn't finish that. Could you try rephrasing?" });
  send("done", {});
}