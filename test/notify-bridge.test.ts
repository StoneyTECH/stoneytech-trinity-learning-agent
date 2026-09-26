// Every test here swaps globalThis.fetch for a fake, so nothing touches the network.
// Bridge URLs use the reserved .invalid TLD, which can never resolve even if a fake were missing.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { notifyBridge } from '../src/notify-bridge.ts';

const BRIDGE = 'https://bridge.invalid/notify';
const ENV_KEYS = ['TELEGRAM_BRIDGE_URL', 'TELEGRAM_CHAT_ID'] as const;

describe('notifyBridge', () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('skips delivery without calling fetch unless both a bridge URL and a chat id are set', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch must not be called');
    });
    const log = t.mock.method(console, 'log', () => {});

    assert.equal(await notifyBridge({ message: 'hi' }), false);
    assert.equal(await notifyBridge({ message: 'hi', bridgeUrl: BRIDGE }), false);
    assert.equal(await notifyBridge({ message: 'hi', chatId: '42' }), false);

    assert.equal(fetchMock.mock.callCount(), 0);
    assert.match(String(log.mock.calls[0].arguments[0]), /not configured; skipping delivery/);
  });

  it('POSTs the message and chat id as JSON, with a timeout signal', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('ok'));

    assert.equal(await notifyBridge({ message: '<b>hello</b>', bridgeUrl: BRIDGE, chatId: '42' }), true);

    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, BRIDGE);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(String(init?.body)), { message: '<b>hello</b>', chat_id: '42' });
    assert.ok(init?.signal instanceof AbortSignal);
  });

  it('falls back to TELEGRAM_BRIDGE_URL / TELEGRAM_CHAT_ID, with explicit options taking precedence', async (t) => {
    process.env.TELEGRAM_BRIDGE_URL = 'https://env-bridge.invalid/notify';
    process.env.TELEGRAM_CHAT_ID = 'env-chat';
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('ok'));

    await notifyBridge({ message: 'm' });
    await notifyBridge({ message: 'm', bridgeUrl: BRIDGE, chatId: 'option-chat' });

    const sent = fetchMock.mock.calls.map((call) => [
      call.arguments[0],
      JSON.parse(String(call.arguments[1]?.body)).chat_id
    ]);
    assert.deepEqual(sent, [
      ['https://env-bridge.invalid/notify', 'env-chat'],
      [BRIDGE, 'option-chat']
    ]);
  });

  it('reports a non-2xx response as a warning and false, with the body capped at 200 chars', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('x'.repeat(500), { status: 502 }));
    const warn = t.mock.method(console, 'warn', () => {});

    assert.equal(await notifyBridge({ message: 'm', bridgeUrl: BRIDGE, chatId: '1' }), false);

    const message = String(warn.mock.calls[0].arguments[0]);
    assert.match(message, /Notification bridge returned 502: x+$/);
    assert.equal(message.match(/x+$/)?.[0].length, 200);
  });

  it('swallows network errors unless strict', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => {
      throw new TypeError('fetch failed');
    });
    const warn = t.mock.method(console, 'warn', () => {});

    assert.equal(await notifyBridge({ message: 'm', bridgeUrl: BRIDGE, chatId: '1' }), false);
    assert.match(String(warn.mock.calls[0].arguments[0]), /non-blocking\): fetch failed/);
    await assert.rejects(notifyBridge({ message: 'm', bridgeUrl: BRIDGE, chatId: '1', strict: true }), /fetch failed/);
  });

  it('throws on a non-2xx response in strict mode', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('nope', { status: 500 }));

    await assert.rejects(
      notifyBridge({ message: 'm', bridgeUrl: BRIDGE, chatId: '1', strict: true }),
      /Notification bridge returned 500: nope/
    );
  });
});
