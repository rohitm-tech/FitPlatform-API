import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { config } from '../../../config/env.js';
import { buildCoachTools } from './tools.js';

// How many analyze -> tool rounds a single reply may take before we stop and
// answer with whatever we have (mirrors the tool-loop cap pattern used
// elsewhere in this codebase's AI services).
const MAX_STEPS = 4;

// Runs one agentic coach turn: Gemini (via LangChain, tools bound) decides
// whether to call log_recovery / search_exercises, we execute the call(s)
// and feed results back, and loop until it answers in plain text or the
// step cap is hit. Returns the final text plus the cards/trace the tools
// produced along the way, so the caller can persist all three onto the
// assistant message.
export async function runCoachAgent({ athleteId, systemPrompt, history = [], message, photo }) {
  const trace = [];
  const cards = [];
  const tools = buildCoachTools(athleteId, trace, cards);
  const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));

  const llm = new ChatGoogleGenerativeAI({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
    temperature: 0.4,
  }).bindTools(tools);

  const messages = [
    new SystemMessage(systemPrompt),
    ...history.map((h) => (h.role === 'user' ? new HumanMessage(h.text) : new AIMessage(h.text))),
  ];

  const humanContent = photo
    ? [
        { type: 'text', text: message },
        { type: 'image_url', image_url: `data:${photo.mimeType};base64,${photo.data}` },
      ]
    : message;
  messages.push(new HumanMessage({ content: humanContent }));

  let finalText = '';
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await llm.invoke(messages);
    messages.push(response);

    const calls = response.tool_calls || [];
    if (!calls.length) {
      finalText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
      break;
    }

    for (const call of calls) {
      const matchedTool = toolsByName[call.name];
      let result;
      try {
        result = matchedTool ? await matchedTool.invoke(call.args) : `Unknown tool: ${call.name}`;
      } catch (error) {
        result = `That tool failed: ${error.message}`;
        trace.push({ tool: call.name, label: `${call.name.replace(/_/g, ' ')} failed`, status: 'error' });
      }
      messages.push(new ToolMessage({ content: String(result), tool_call_id: call.id }));
    }
  }

  return {
    answer: (finalText || "I couldn't finish that thought — try asking again.").trim(),
    cards,
    toolTrace: trace,
  };
}
