import { AiRateLimiter } from './ai-rate-limiter';
describe('AI local budgets', () => {
  it('shares conservative token reservations without consuming rejected calls', () => {
    const limiter = new AiRateLimiter();
    limiter.consume(1, 0, 120000);
    limiter.consumeRequester(2, 0, 100000);
    expect(() => limiter.consumeRequester(3, 0, 6000)).toThrow();
    expect(() => limiter.consume(3, 0, 5000)).not.toThrow();
    expect(() => limiter.consumeRequester(3, 0, 1)).toThrow();
    expect(() => limiter.consumeRequester(3, 60000, 6000)).not.toThrow();
  });
  it('caps requesters at five per hour', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 5; i++) limiter.consumeRequester(1, 0);
    expect(() => limiter.consumeRequester(1, 0)).toThrow('AI generation limit');
    expect(() => limiter.consumeRequester(1, 3600000)).not.toThrow();
  });
  it('caps requesters at ten per day', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 10; i++)
      limiter.consumeRequester(1, Math.floor(i / 5) * 3600000);
    expect(() => limiter.consumeRequester(1, 7200000)).toThrow(
      'AI generation limit',
    );
    expect(() => limiter.consumeRequester(1, 86400000)).not.toThrow();
  });
  it('shares the minute pool between Manager and requester features', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 6; i++) {
      limiter.consume(i, 0);
      limiter.consumeRequester(i, 0);
    }
    expect(() => limiter.consumeRequester(20, 0)).toThrow();
    expect(() => limiter.consume(20, 0)).toThrow();
  });
  it('shares the daily pool between Manager and requester features', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 400; i++) {
      if (i % 2) limiter.consumeRequester(i, i * 60000);
      else limiter.consume(i, i * 60000);
    }
    expect(() => limiter.consumeRequester(500, 400 * 60000)).toThrow();
    expect(() => limiter.consume(500, 400 * 60000)).toThrow();
  });
  it('caps managers at ten per hour', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 10; i++) limiter.consume(1, 0);
    expect(() => limiter.consume(1, 0)).toThrow('AI generation limit');
    expect(() => limiter.consume(1, 3600000)).not.toThrow();
  });
  it('caps managers at 25 per day across hourly windows', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 25; i++)
      limiter.consume(1, Math.floor(i / 10) * 3600000);
    expect(() => limiter.consume(1, 3 * 3600000)).toThrow(
      'AI generation limit',
    );
    expect(() => limiter.consume(1, 86400000)).not.toThrow();
  });
  it('caps global requests at twelve per minute', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 12; i++) limiter.consume(i, 0);
    expect(() => limiter.consume(20, 0)).toThrow('AI generation limit');
    expect(() => limiter.consume(20, 60000)).not.toThrow();
  });
  it('caps global requests at 400 per day', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 400; i++) limiter.consume(i, i * 60000);
    expect(() => limiter.consume(500, 400 * 60000)).toThrow(
      'AI generation limit',
    );
    expect(() => limiter.consume(500, 86400000)).not.toThrow();
  });
  it('does not consume global budget for rejected manager calls', () => {
    const limiter = new AiRateLimiter();
    for (let i = 0; i < 10; i++) limiter.consume(1, 0);
    for (let i = 0; i < 20; i++) expect(() => limiter.consume(1, 0)).toThrow();
    expect(() => limiter.consume(2, 0)).not.toThrow();
    expect(() => limiter.consume(3, 0)).not.toThrow();
    expect(() => limiter.consume(4, 0)).toThrow();
  });
});
