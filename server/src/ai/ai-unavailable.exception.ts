import { ServiceUnavailableException } from '@nestjs/common';

export const AI_UNAVAILABLE_MESSAGE =
  'AI suggestions are temporarily unavailable. Please try again later.';

// The global filter recognizes only this fixed, payload-free availability error.
export class AiUnavailableException extends ServiceUnavailableException {
  constructor() {
    super(AI_UNAVAILABLE_MESSAGE);
  }
}
