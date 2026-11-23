import { Controller, Logger, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';

const model = process.env.GEMINI_TRANSCRIBE_MODEL?.trim() || 'gemini-3.5-transcribe-live';

@Controller('ai/transcription')
export class TranscriptionController {
  private readonly logger = new Logger(TranscriptionController.name);
  @Post('token')
  @UseGuards(AuthGuard)
  async token(@Req() request: { user: { sub: number } }) {
    void request;
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
      this.logger.warn('Dictation token unavailable: GEMINI_API_KEY is not configured');
      throw new ServiceUnavailableException('Voice dictation is not configured');
    }
    const now = Date.now();
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(now + 5 * 60_000).toISOString(),
          newSessionExpireTime: new Date(now + 60_000).toISOString(),
          // The REST wire field is bidiGenerateContentSetup (SDKs expose it as
          // liveConnectConstraints); Google's error response identifies this.
          bidiGenerateContentSetup: {
            model: `models/${model}`,
            generationConfig: { responseModalities: ['TEXT'] },
            inputAudioTranscription: {},
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        let diagnostic = '';
        try {
          const body = await response.json() as { error?: { code?: unknown; status?: unknown; message?: unknown } };
          const code = typeof body.error?.code === 'number' ? body.error.code : response.status;
          const status = typeof body.error?.status === 'string' ? body.error.status.slice(0, 60) : 'UNKNOWN';
          const message = typeof body.error?.message === 'string'
            ? body.error.message.replace(/\s+/g, ' ').replace(/(?:AIza|key=)[A-Za-z0-9_\-]{12,}/gi, '[redacted]').slice(0, 240)
            : 'No provider message';
          diagnostic = `code=${code} status=${status} message=${message}`;
        } catch {
          diagnostic = `HTTP ${response.status}; unreadable provider error`;
        }
        this.logger.warn(`Gemini Live token rejected: ${diagnostic}`);
        throw new ServiceUnavailableException('Voice dictation is unavailable. Check the server log for a sanitized Gemini diagnostic.');
      }
      const body = await response.json() as { name?: unknown };
      if (typeof body.name !== 'string') {
        this.logger.warn('Gemini Live token response omitted the token name');
        throw new ServiceUnavailableException('Voice dictation is unavailable');
      }
      return { token: body.name, model };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.warn(`Gemini Live token request failed (${error instanceof Error ? error.constructor.name : typeof error})`);
      throw new ServiceUnavailableException('Could not connect to Gemini to start voice dictation');
    }
  }
}
