// src/llm.ts is the one place this agent calls a model. Every request here goes to a
// fake fetch, so these tests run offline and pin two things: exactly what OpenRouter
// receives, and how its answers (and its failures) are read back.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { complete, modelFromEnv, DEFAULT_MODEL, OPENROUTER_URL } from '../src/llm.ts';

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}

const answer = (content: unknown) => ({
  model: 'anthropic/claude-opus-5.5',
  choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 34, cost: 0.0012 }
});

const base = { apiKey: 'fake-key', model: 'lab/model', user: 'hi', maxTokens: 99 };

describe('modelFromEnv', () => {
  it('uses LLM_MODEL when set, and the default otherwise', () => {
    assert.equal(modelFromEnv({}), DEFAULT_MODEL);
    // An unset GitHub repository variable arrives as an empty string.
    assert.equal(modelFromEnv({ LLM_MODEL: '  ' }), DEFAULT_MODEL);
    assert.equal(modelFromEnv({ LLM_MODEL: 'openai/gpt-6-luna-pro' }), 'openai/gpt-6-luna-pro');
  });
});

describe('complete', () => {
  it('sends one chat-completions request carrying the key, the model and both prompts', async () => {
    const calls: Call[] = [];
    await complete({ ...base, system: 'be brief', fetchImpl: fakeFetch(200, answer('hello'), calls) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, OPENROUTER_URL);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer fake-key');
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.model, 'lab/model');
    assert.equal(body.max_tokens, 99);
    assert.deepEqual(body.messages, [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' }
    ]);
  });

  it('sends no system message when there is no system prompt', async () => {
    const calls: Call[] = [];
    await complete({ ...base, fetchImpl: fakeFetch(200, answer('hello'), calls) });
    assert.deepEqual(JSON.parse(String(calls[0].init.body)).messages, [{ role: 'user', content: 'hi' }]);
  });

  it('returns the text, the model that answered, why it stopped, and what it cost', async () => {
    const r = await complete({ ...base, fetchImpl: fakeFetch(200, answer('hello')) });
    assert.deepEqual(r, {
      text: 'hello',
      model: 'anthropic/claude-opus-5.5',
      finishReason: 'stop',
      inputTokens: 12,
      outputTokens: 34,
      costUsd: 0.0012
    });
  });

  it('points at the key when OpenRouter rejects it', async () => {
    const rejected = fakeFetch(401, { error: { message: 'No auth credentials found', code: 401 } });
    await assert.rejects(complete({ ...base, fetchImpl: rejected }), /HTTP 401 \(check OPENROUTER_API_KEY\)/);
  });

  it('surfaces an error OpenRouter reports inside a 200 response', async () => {
    const failed = fakeFetch(200, { error: { message: 'Provider returned error', code: 502 } });
    await assert.rejects(complete({ ...base, fetchImpl: failed }), /Provider returned error/);
  });

  it('refuses an empty answer rather than passing it on as a draft', async () => {
    for (const body of [answer(''), answer('   \n'), answer(null), { choices: [] }]) {
      await assert.rejects(complete({ ...base, fetchImpl: fakeFetch(200, body) }), /empty response/, JSON.stringify(body));
    }
  });

  it('says so when the response is not JSON', async () => {
    await assert.rejects(complete({ ...base, fetchImpl: fakeFetch(200, '<html>gateway</html>') }), /not JSON/);
  });
});
