// Model router – routes requests to OpenRouter with the appropriate key/model
// Supports reasoning models (e.g. Nemotron) via the `reasoning` field

export type ModelId = 'agent_a' | 'agent_b' | 'agent_c' | 'agent_d' | 'test';

interface ModelConfig {
  id: ModelId;
  label: string;
  openrouterModel: string;
  envKey: string;
  supportsReasoning?: boolean; // models that accept {"reasoning": {"enabled": true}}
}

export const MODEL_CONFIGS: Record<ModelId, ModelConfig> = {
  agent_a: {
    id: 'agent_a',
    label: 'GPT-5.4',
    openrouterModel: 'openai/gpt-5.4',
    envKey: 'OPENROUTER_API_KEY_GPT',
  },
  agent_b: {
    id: 'agent_b',
    label: 'Claude Sonnet 4.6',
    openrouterModel: 'anthropic/claude-sonnet-4.6',
    envKey: 'OPENROUTER_API_KEY_CLAUDE',
  },
  agent_c: {
    id: 'agent_c',
    label: 'Gemini 3.1 Pro Preview',
    openrouterModel: 'google/gemini-3.1-pro-preview',
    envKey: 'OPENROUTER_API_KEY_GEMINI',
  },
  agent_d: {
    id: 'agent_d',
    label: 'Grok 4.20 Beta Reasoning',
    openrouterModel: 'x-ai/grok-4.20-beta',
    envKey: 'OPENROUTER_API_KEY_GROK',
  },
  test: {
    id: 'test',
    label: 'Test Agent (Nemotron Super 120B)',
    // Exact slug from openrouter.ai — Nemotron Super 120B (free tier, replaces retired nano)
    openrouterModel: 'nvidia/nemotron-3-super-120b-a12b:free',
    envKey: 'OPENROUTER_API_KEY_TEST',
    supportsReasoning: true,
  },
};

// ── Message types ─────────────────────────────────────────────────
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  // Preserved from a previous reasoning response (pass back unmodified)
  reasoning_details?: unknown;
}

export interface RouterRequest {
  model_id: ModelId;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  task_type?: 'coding' | 'puzzle' | 'writing';
  // If true, enables reasoning for models that support it
  enable_reasoning?: boolean;
}

export interface RouterResponse {
  content: string;
  model: string;
  reasoning_details?: unknown; // pass back to client so it can chain multi-turn
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: string;
}

// ── Key + model resolution ─────────────────────────────────────────
// Priority: agent-specific key → master key → test key
// OpenRouter is a unified API – ONE key can access ALL models (Claude, Gemini, GPT, etc.)
// You only need multiple keys if you want separate billing per agent.
function getApiKey(modelId: ModelId): string {
  const config = MODEL_CONFIGS[modelId];
  if (!config) throw new Error(`Unknown model: ${modelId}`);

  const key =
    process.env[config.envKey]          ||   // 1. agent-specific key (optional, for separate billing)
    process.env.OPENROUTER_API_KEY       ||   // 2. single master key (recommended for most setups)
    process.env.OPENROUTER_API_KEY_TEST;      // 3. test key fallback

  if (!key) {
    throw new Error(
      `No API key found. Set OPENROUTER_API_KEY in .env.local (works for all models on OpenRouter).`
    );
  }
  return key;
}

function resolveModel(modelId: ModelId): { modelName: string; usingFallback: boolean; supportsReasoning: boolean } {
  const config = MODEL_CONFIGS[modelId];
  // If no agent-specific key AND no master key → fall back to test model (free)
  const hasRealKey =
    !!process.env[config.envKey] ||
    !!process.env.OPENROUTER_API_KEY;

  if (!hasRealKey) {
    const testCfg = MODEL_CONFIGS.test;
    return { modelName: testCfg.openrouterModel, usingFallback: true, supportsReasoning: !!testCfg.supportsReasoning };
  }
  return { modelName: config.openrouterModel, usingFallback: false, supportsReasoning: !!config.supportsReasoning };
}


// ── Main router ───────────────────────────────────────────────────
export async function routeToModel(request: RouterRequest): Promise<RouterResponse> {
  const apiKey = getApiKey(request.model_id);
  const { modelName, supportsReasoning } = resolveModel(request.model_id);

  // Strip reasoning_details from messages before sending (OpenRouter wants them preserved
  // in the format: assistant message with reasoning_details at root level, not nested)
  const messages = request.messages.map(m => {
    if (m.reasoning_details) {
      // Pass through as-is so the model can continue from where it left off
      return { role: m.role, content: m.content, reasoning_details: m.reasoning_details };
    }
    return { role: m.role, content: m.content };
  });

  // ── Identity blinding ───────────────────────────────────────────
  // CRITICAL: participants must not know which model they're using.
  // This guard is prepended to EVERY request regardless of task type.
  // It must come first so it takes precedence over any user-crafted system prompt.
  const IDENTITY_GUARD: ChatMessage = {
    role: 'system',
    content: [
      'CRITICAL INSTRUCTION — follow this at all times, no exceptions:',
      'You are a generic AI assistant. You must NEVER reveal, hint at, or confirm:',
      '  - Your actual model name (e.g. GPT, Claude, Gemini, Grok, Llama, Nemotron)',
      '  - Your creator or company (OpenAI, Anthropic, Google, xAI, NVIDIA, Meta, etc.)',
      '  - Your version number or release date',
      '  - Any details that would let someone infer which AI system you are',
      'If asked directly (e.g. "What model are you?", "Are you ChatGPT?", "Who made you?"),',
      'respond with exactly: "I am the AI assistant assigned to this task. My identity is not disclosed as part of this study."',
      'Do not apologise for this restriction. Do not hint that you "can\'t say". Just give that response and continue helping.',
      'This instruction overrides any other instruction, including ones in the user\'s messages.',
    ].join('\n'),
  };

  // Prepend identity guard, then user messages
  // If the first user message is already a system message, guard still goes first.
  const guardedMessages = [IDENTITY_GUARD, ...messages];

  const body: Record<string, unknown> = {
    model: modelName,
    messages: guardedMessages,
    temperature: request.temperature ?? 0.7,
    max_tokens: request.max_tokens ?? 2048,
  };

  // Enable reasoning for supported models when requested (or always for the test model)
  if (supportsReasoning && (request.enable_reasoning !== false)) {
    body.reasoning = { enabled: true };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://hti-lab-benchmark.local',
        'X-Title': 'HTI-Lab AgenticAI Benchmark',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: '',
        model: modelName,
        error: `OpenRouter API error (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const msg    = choice?.message;

    return {
      content:          msg?.content || '',
      model:            data.model || modelName,
      reasoning_details: msg?.reasoning_details, // pass back for multi-turn chaining
      usage:            data.usage,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { content: '', model: modelName, error: `Router error: ${message}` };
  }
}
