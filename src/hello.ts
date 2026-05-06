// GVAR-13 acceptance: hello-world that loads the SDK, calls Opus 4.7 once,
// and exits cleanly. Proves the env keys are wired and the SDK works.
//
// Run: npm run hello

import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Anthropic({ apiKey });

const response = await client.messages.create({
  model: 'claude-opus-4-7',
  max_tokens: 256,
  messages: [
    {
      role: 'user',
      content:
        'In one sentence, confirm you are Claude Opus 4.7 and the StoneyTECH Trinity learning-agent ' +
        'has a working API connection. Be brief and pragmatic — no hedging.'
    }
  ]
});

const text = response.content
  .filter((b) => b.type === 'text')
  .map((b) => (b.type === 'text' ? b.text : ''))
  .join('\n');

console.log('=== StoneyTECH Trinity Learning-Agent hello-world ===');
console.log(`Model used: ${response.model}`);
console.log(`Stop reason: ${response.stop_reason}`);
console.log(`Tokens — in: ${response.usage.input_tokens}, out: ${response.usage.output_tokens}`);
console.log('---');
console.log(text);
console.log('---');
console.log('✓ SDK + API key + Opus 4.7 all working.');
