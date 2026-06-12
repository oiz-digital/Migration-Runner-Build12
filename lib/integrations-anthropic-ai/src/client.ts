import Anthropic from "@anthropic-ai/sdk";

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

export const anthropic: Anthropic | null =
  baseURL && apiKey
    ? new Anthropic({ apiKey, baseURL })
    : null;

export function requireAnthropic(): Anthropic {
  if (!anthropic) {
    throw new Error(
      "Anthropic AI integration is not configured. Set AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY.",
    );
  }
  return anthropic;
}
