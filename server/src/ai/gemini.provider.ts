import { Injectable } from '@nestjs/common';
import {
  DraftAiInput,
  DRAFT_SYSTEM_PROMPT,
  draftResponseSchema,
} from './ticket-assistance.contract';
import {
  AI_MODEL,
  AI_PROMPT_BYTES,
  AI_RESPONSE_BYTES,
  AI_TIMEOUT_MS,
  AiInput,
  AiProviderError,
  responseSchema,
  SYSTEM_PROMPT,
} from './ai-contract';

export abstract class AiRecommendationProvider {
  abstract generate(input: AiInput): Promise<unknown>;
  abstract generateDraft(input: DraftAiInput): Promise<unknown>;
}

function requestBody(
  input: AiInput | DraftAiInput,
  prompt: string,
  schema: object,
) {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: schema,
      maxOutputTokens: 2048,
      temperature: 0,
    },
  });
}
// Conservative budget: reserve one token per UTF-8 request byte (including JSON
// overhead) plus the full output allowance. No tokenizer or prompt cache needed.
export const routingTokenReservation = (input: AiInput) =>
  Buffer.byteLength(requestBody(input, SYSTEM_PROMPT, responseSchema)) + 2048;
export const draftTokenReservation = (input: DraftAiInput) =>
  Buffer.byteLength(
    requestBody(input, DRAFT_SYSTEM_PROMPT, draftResponseSchema),
  ) + 2048;

@Injectable()
export class GeminiRecommendationProvider extends AiRecommendationProvider {
  generate(input: AiInput): Promise<unknown> {
    return this.request(input, SYSTEM_PROMPT, responseSchema);
  }

  generateDraft(input: DraftAiInput): Promise<unknown> {
    return this.request(input, DRAFT_SYSTEM_PROMPT, draftResponseSchema);
  }

  private async request(
    input: AiInput | DraftAiInput,
    prompt: string,
    schema: object,
  ): Promise<unknown> {
    const key = process.env.GEMINI_API_KEY?.trim();
    // No silent model/provider substitution, including paid fallbacks.
    if (!key || (process.env.AI_MODEL && process.env.AI_MODEL !== AI_MODEL))
      throw new AiProviderError('unavailable');
    const body = requestBody(input, prompt, schema);
    if (Buffer.byteLength(body) > AI_PROMPT_BYTES)
      throw new AiProviderError('invalid');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          body,
          signal: controller.signal,
          redirect: 'error',
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new AiProviderError(
          response.status === 429 ? 'quota' : 'unavailable',
          response.status,
        );
      }
      if (!response.body) throw new AiProviderError('invalid');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > AI_RESPONSE_BYTES) {
          await reader.cancel();
          throw new AiProviderError('invalid');
        }
        chunks.push(value);
      }
      const envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        candidates?: {
          finishReason?: string;
          content?: { parts?: { text?: string; thought?: boolean }[] };
        }[];
      };
      const candidate = envelope.candidates?.[0];
      if (candidate?.finishReason !== 'STOP')
        throw new AiProviderError('rejected');
      const parts = candidate.content?.parts;
      if (
        !Array.isArray(parts) ||
        parts.length !== 1 ||
        parts[0].thought ||
        typeof parts[0].text !== 'string'
      )
        throw new AiProviderError('invalid');
      return JSON.parse(parts[0].text) as unknown;
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(
        controller.signal.aborted
          ? 'timeout'
          : error instanceof TypeError
            ? 'unavailable'
            : 'invalid',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
