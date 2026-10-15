import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { setDefaultResultOrder } from "node:dns";
import type { CutadConfig } from "../config/homeConfig";

// IPv6-first resolution can hang on some networks (observed: ai.cutad.web.id).
setDefaultResultOrder("ipv4first");

export interface GatewayModelInfo {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  reasoning: boolean;
}

export class GatewayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function createProvider(config: CutadConfig) {
  return createOpenAICompatible({
    name: "cutad",
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });
}

async function errorFromResponse(res: Response): Promise<GatewayError> {
  let code = `http_${res.status}`;
  let message = `HTTP ${res.status} from gateway`;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } };
    if (body?.error?.code) code = body.error.code;
    if (body?.error?.message) message = body.error.message;
  } catch (err) {
    message = `${message} (unparseable error body: ${String(err)})`;
  }
  return new GatewayError(res.status, code, message);
}

export async function listModels(config: CutadConfig): Promise<GatewayModelInfo[]> {
  const res = await fetch(`${config.baseUrl}/models`, {
    headers: { authorization: `Bearer ${config.apiKey}` },
  });
  if (!res.ok) throw await errorFromResponse(res);
  const body = (await res.json()) as {
    data?: Array<{
      id?: string;
      display_name?: string;
      context_window?: number;
      max_output_tokens?: number;
      capabilities?: { reasoning?: boolean } | null;
    }>;
  };
  return (body.data ?? []).map((m) => ({
    id: m.id ?? "unknown",
    displayName: m.display_name ?? m.id ?? "unknown",
    contextWindow: m.context_window ?? 0,
    maxOutputTokens: m.max_output_tokens ?? 0,
    reasoning: Boolean(m.capabilities?.reasoning),
  }));
}
