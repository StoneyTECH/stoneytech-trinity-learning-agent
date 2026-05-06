// POST a message to an optional notification bridge.
//
// The bridge can be an n8n workflow, queue ingress, or any small delivery
// service that accepts {message, chat_id}. Public pattern repos should not ship
// with live delivery defaults; configure the bridge entirely through env.

export interface NotifyOptions {
  /** Pre-formatted message body. */
  message: string;
  /** Optional chat-id override. */
  chatId?: string;
  /** Optional bridge URL override. */
  bridgeUrl?: string;
  /** If true, throw on bridge failure. If false, log a warning and continue. Default false. */
  strict?: boolean;
}

export async function notifyBridge(opts: NotifyOptions): Promise<boolean> {
  const url = opts.bridgeUrl || process.env.TELEGRAM_BRIDGE_URL || '';
  const chatId = opts.chatId || process.env.TELEGRAM_CHAT_ID || '';
  const strict = opts.strict ?? false;

  if (!url || !chatId) {
    console.log('Notification bridge not configured; skipping delivery.');
    return false;
  }

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
      const msg = `Notification bridge returned ${response.status}: ${detail.slice(0, 200)}`;
      if (strict) throw new Error(msg);
      console.warn(`⚠ ${msg}`);
      return false;
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (strict) throw err;
    console.warn(`⚠ Notification bridge failed (non-blocking): ${msg}`);
    return false;
  }
}
