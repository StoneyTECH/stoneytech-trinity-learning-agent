// GVAR-13 acceptance: hello-world that calls the configured model once through
// OpenRouter and exits cleanly. Proves the key and the model are wired.
//
// Run: npm run hello

import { complete, modelFromEnv } from './llm.ts';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('Error: OPENROUTER_API_KEY not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const model = modelFromEnv();
const response = await complete({
  apiKey,
  model,
  maxTokens: 256,
  user:
    'In one sentence, say which model you are and confirm the StoneyTECH Trinity learning-agent ' +
    'has a working API connection. Be brief and pragmatic — no hedging.'
});

console.log('=== StoneyTECH Trinity Learning-Agent hello-world ===');
console.log(`Model requested: ${model}`);
console.log(`Model used: ${response.model}`);
console.log(`Finish reason: ${response.finishReason}`);
console.log(`Tokens — in: ${response.inputTokens}, out: ${response.outputTokens}`);
console.log('---');
console.log(response.text);
console.log('---');
console.log('✓ OpenRouter key and model working.');
