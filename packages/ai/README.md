# @paperwright/ai

Prompt to template, sample data, and edit-by-instruction for paperwright documents, through
whatever language model the host already has. No keys live here.

```ts
import { gemini, generateTemplate, suggestSampleData } from '@paperwright/ai';

const client = gemini({ apiKey: process.env.GEMINI_API_KEY!, model: 'gemini-flash-latest' });
const { model, attempts } = await generateTemplate({
  client,
  prompt: 'An employment offer letter with the salary package as a table and two signatures',
  sampleData: { candidate: { name: 'Ama Mensah' }, role: { title: 'Designer', startDate: '2026-10-01' } },
});
const { data } = await suggestSampleData({ client, model });
```

How it works: the model's JSON Schema (from the Zod schema) plus a short authoring guide are the
system prompt; the answer is parsed, run through `validateModel`, and any issues go back with
their paths for a repair round (three by default). Sample data is checked with the real resolver,
and bindings still empty go back the same way. Nothing reaches the renderer that did not
validate.

Adapters: `gemini(...)` for Google's REST API and `openAiCompatible(...)` for the chat-completions
shape (OpenAI, Groq, Mistral, OpenRouter, Ollama). `scripted([...])` answers from a list, for
tests. Implement `LlmClient` for anything else.
