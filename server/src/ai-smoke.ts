import {
  AI_MODEL,
  AiInput,
  AiProviderError,
  validateResult,
} from './ai/ai-contract';
import { GeminiRecommendationProvider } from './ai/gemini.provider';

// Deliberately no Prisma/application imports: this probe cannot mutate a ticket.
async function main() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.log('SKIP: local Gemini key absent');
    return;
  }
  const input: AiInput = {
    ticket: {
      title: 'VPN connection issue',
      description:
        'VPN connection fails from company laptop while working remotely.',
      category: 'Network',
      priority: 'MEDIUM',
      tags: [],
    },
    candidates: {
      categories: [{ id: 1, name: 'Network' }],
      tags: [{ id: 2, name: 'VPN' }],
      teams: [{ id: 3, name: 'Network support', specialties: ['VPN'] }],
      agents: [
        { id: 4, name: 'Synthetic Agent', teamIds: [3], specialties: ['VPN'] },
      ],
    },
  };
  try {
    validateResult(
      await new GeminiRecommendationProvider().generate(input),
      input,
    );
    console.log(
      `PASS: ${AI_MODEL} synthetic structured response validates; no database access or mutation`,
    );
  } catch (error) {
    console.log(
      `FAIL: synthetic Gemini probe (${error instanceof AiProviderError ? error.category : 'unavailable'}; HTTP ${error instanceof AiProviderError ? (error.httpStatus ?? 'none') : 'none'}); no provider body logged`,
    );
    process.exitCode = 1;
  }
}
void main();
