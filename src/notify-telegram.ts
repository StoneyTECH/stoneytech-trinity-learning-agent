// POST a message to the Nemotron Telegram bridge (n8n webhook).
//
// The bridge is an n8n workflow that owns the bot token + chat-id mapping.
// We just send {message, chat_id} and it does the actual Telegram delivery.
//
// Bridge URL and chat-id are configurable via env, with sensible defaults that
// match the existing JobSearch tooling.

const DEFAULT_BRIDGE_URL = 'https://stoneytech.app.n8n.cloud/webhook/nemotron-notify';
const DEFAULT_CHAT_ID = '7387290079';

export interface NotifyOptions {
  /** Pre-formatted Telegram-flavored markdown / HTML body. */
  message: string;
  /** Optional chat-id override. Default = stoney's personal chat. */
  chatId?: string;
  /** Optional bridge URL override. */
  bridgeUrl?: string;
  /** If true, throw on bridge failure. If false, log a warning and continue. Default false. */
  strict?: boolean;
}

export async function notifyTelegram(opts: NotifyOptions): Promise<boolean> {
  const url = opts.bridgeUrl || process.env.TELEGRAM_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  const chatId = opts.chatId || process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;
  const strict = opts.strict ?? false;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: opts.message, chat_id: chatId }),
      // Cap so a hanging bridge doesn't block the whole job.
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const msg = `Telegram bridge returned ${response.status}: ${detail.slice(0, 200)}`;
      if (strict) throw new Error(msg);
      console.warn(`⚠ ${msg}`);
      return false;
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (strict) throw err;
    console.warn(`⚠ Telegram notify failed (non-blocking): ${msg}`);
    return false;
  }
}
