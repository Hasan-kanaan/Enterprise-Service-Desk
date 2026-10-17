import {
  AI_MODEL,
  AI_RESPONSE_BYTES,
  AiInput,
  AiProviderError,
} from './ai-contract';
import { GeminiRecommendationProvider } from './gemini.provider';
import { priorities } from './ai-contract';

describe('Gemini HTTPS boundary', () => {
  const input: AiInput = {
    ticket: {
      title: 'VPN',
      description: 'VPN fails',
      category: 'Network',
      priority: 'MEDIUM',
      tags: [],
    },
    candidates: { categories: [], tags: [], teams: [], agents: [] },
  };
  let originalKey: string | undefined, originalModel: string | undefined;
  let fetchMock: jest.SpyInstance;
  const provider = new GeminiRecommendationProvider();
  beforeEach(() => {
    originalKey = process.env.GEMINI_API_KEY;
    originalModel = process.env.AI_MODEL;
    process.env.GEMINI_API_KEY = 'synthetic-test-key';
    process.env.AI_MODEL = AI_MODEL;
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.AI_MODEL;
    else process.env.AI_MODEL = originalModel;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  const response = (text: string, finishReason = 'STOP') =>
    new Response(
      JSON.stringify({
        candidates: [{ finishReason, content: { parts: [{ text }] } }],
      }),
    );
  it('uses fixed HTTPS, header authentication, JSON schema and no tools', async () => {
    fetchMock.mockResolvedValue(response('{"ok":true}'));
    expect(await provider.generate(input)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent`,
    );
    expect(init.redirect).toBe('error');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'contents',
      'generationConfig',
      'systemInstruction',
    ]);
    expect(init.body).not.toContain('synthetic-test-key');
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      maxOutputTokens: 2048,
    });
  });
  it('fails closed with no key before network', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(provider.generate(input)).rejects.toMatchObject({
      category: 'unavailable',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses the same single HTTP transport with a separate requester schema and prompt', async () => {
    fetchMock.mockResolvedValue(response('{}'));
    await provider.generateDraft({
      draft: {
        title: '',
        description: 'VPN connection fails on my work laptop.',
      },
      candidates: { categories: [], tags: [], regions: [], departments: [] },
      priorities,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toContain('Evaluate workplace IT support scope FIRST');
    expect(init.body).toContain('NEEDS_MORE_INFORMATION');
    expect(init.body).not.toContain('synthetic-test-key');
    expect(init.body).not.toContain('teamIds');
  });
  it('does not switch models', async () => {
    process.env.AI_MODEL = 'other';
    await expect(provider.generate(input)).rejects.toBeInstanceOf(
      AiProviderError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([429, 403, 500])(
    'handles HTTP %s without raw error disclosure or retries',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('private provider details', { status }),
      );
      await expect(provider.generate(input)).rejects.toThrow(
        'temporarily unavailable',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('handles network failure', async () => {
    fetchMock.mockRejectedValue(new Error('private network details'));
    await expect(provider.generate(input)).rejects.toThrow(
      'temporarily unavailable',
    );
  });
  it('aborts at ten seconds', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const assertion = expect(provider.generate(input)).rejects.toMatchObject({
      category: 'timeout',
    });
    await jest.advanceTimersByTimeAsync(10000);
    await assertion;
  });
  it.each(['not json', '```json\n{}\n```'])(
    'rejects malformed output %#',
    async (text) => {
      fetchMock.mockResolvedValue(response(text));
      await expect(provider.generate(input)).rejects.toMatchObject({
        category: 'invalid',
      });
    },
  );
  it('rejects content rejection', async () => {
    fetchMock.mockResolvedValue(response('{}', 'SAFETY'));
    await expect(provider.generate(input)).rejects.toMatchObject({
      category: 'rejected',
    });
  });
  it('bounds streamed response bytes', async () => {
    fetchMock.mockResolvedValue(
      new Response('x'.repeat(AI_RESPONSE_BYTES + 1)),
    );
    await expect(provider.generate(input)).rejects.toMatchObject({
      category: 'invalid',
    });
  });
  it('bounds full prompt bytes', async () => {
    await expect(
      provider.generate({
        ...input,
        ticket: { ...input.ticket, description: 'x'.repeat(50000) },
      }),
    ).rejects.toMatchObject({ category: 'invalid' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
