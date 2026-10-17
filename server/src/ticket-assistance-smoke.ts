import { AI_MODEL, AiProviderError, priorities } from './ai/ai-contract';
import { GeminiRecommendationProvider } from './ai/gemini.provider';
import {
  DraftAiInput,
  validateDraftResult,
} from './ai/ticket-assistance.contract';

// Synthetic strings only; no application, Prisma, identity or attachment imports.
async function main() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.log('SKIP: local Gemini key absent');
    return;
  }
  for (const [expected, description] of [
    [
      'IN_SCOPE',
      'VPN connection fails from my company laptop while working remotely.',
    ],
    ['NEEDS_MORE_INFORMATION', 'I have a problem and need some help please.'],
    ['OUT_OF_SCOPE', 'Please give me a recipe for a chocolate cake.'],
  ]) {
    const input: DraftAiInput = {
      draft: { title: '', description },
      candidates: {
        categories: [{ id: 1, name: 'Network' }],
        tags: [{ id: 2, name: 'VPN' }],
        regions: [{ id: 3, name: 'Beirut' }],
        departments: [{ id: 4, name: 'Operations' }],
      },
      priorities,
    };
    try {
      const result = validateDraftResult(
        await new GeminiRecommendationProvider().generateDraft(input),
        input,
      );
      if (result.scope.status !== expected)
        throw new AiProviderError('invalid');
      console.log(
        `PASS: ${AI_MODEL} synthetic requester ${expected}; strict response validates; no database access or mutation`,
      );
    } catch (error) {
      console.log(
        `FAIL: synthetic requester probe (${error instanceof AiProviderError ? error.category : 'unavailable'}; HTTP ${error instanceof AiProviderError ? (error.httpStatus ?? 'none') : 'none'}); no provider body logged`,
      );
      process.exitCode = 1;
      return;
    }
  }
}
void main();
