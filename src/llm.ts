// The one place this agent calls a model: OpenRouter's chat-completions API. One key
// reaches every lab's models, so the model is a setting (LLM_MODEL), not a code change,
// and the repo carries no vendor SDK.

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// The newest Claude on OpenRouter when this was written (September 2026). Set LLM_MODEL,
// in .env or as a repository variable for the scheduled jobs, to use any OpenRouter model id.
export const DEFAULT_MODEL = 'anthropic/claude-opus-5.5';

export function modelFromEnv(env: Record<string, string | undefined> = process.env): string {
  return env.LLM_MODEL?.trim() || DEFAULT_MODEL;
}

export interface Completion {
  text: string;
  /** The model that answered, as OpenRouter reports it. */
  model: string;
  /** 'length' means the answer stopped at maxTokens. */
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
  /** OpenRouter's own figure, when it reports one. */
  costUsd: number | null;
}

interface ChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: unknown }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; code?: number | string };
}

export async function complete(opts: {
  apiKey: string;
  model: string;
  system?: string;
  user: string;
  maxTokens: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<Completion> {
  const messages = [
    ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
    { role: 'user', content: opts.user }
  ];
  const res = await (opts.fetchImpl ?? fetch)(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'StoneyTECH Trinity learning-agent'
    },
    body: JSON.stringify({ model: opts.model, messages, max_tokens: opts.maxTokens, usage: { include: true } }),
    // A long draft can take minutes. Ten minutes matches the old SDK's default ceiling.
    signal: AbortSignal.timeout(opts.timeoutMs ?? 600_000)
  });

  const raw = await res.text();
  if (!res.ok) {
    const hint = res.status === 401 ? ' (check OPENROUTER_API_KEY)' : '';
    throw new Error(`OpenRouter ${opts.model} HTTP ${res.status}${hint}: ${raw.slice(0, 200)}`);
  }
  let json: ChatResponse;
  try {
    json = JSON.parse(raw) as ChatResponse;
  } catch {
    throw new Error(`OpenRouter ${opts.model}: response was not JSON: ${raw.slice(0, 200)}`);
  }
  // OpenRouter can report a provider failure inside a 200.
  if (json.error) throw new Error(`OpenRouter ${opts.model}: ${json.error.message ?? JSON.stringify(json.error)}`);

  const choice = json.choices?.[0];
  const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  if (!text.trim()) throw new Error(`OpenRouter ${opts.model}: empty response`);

  return {
    text,
    model: json.model ?? opts.model,
    finishReason: choice?.finish_reason ?? null,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
    costUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : null
  };
}
