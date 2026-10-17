import { HttpException, Injectable } from '@nestjs/common';

// Bounded process-local fixed windows; check all budgets before consuming any.
@Injectable()
export class AiRateLimiter {
  private entries = new Map<string, { count: number; expires: number }>();
  consume(managerId: number, now = Date.now(), tokens = 2048) {
    return this.consumeFeature(managerId, 'manager', now, tokens);
  }

  consumeRequester(requesterId: number, now = Date.now(), tokens = 2048) {
    return this.consumeFeature(requesterId, 'requester', now, tokens);
  }

  private consumeFeature(
    userId: number,
    feature: 'manager' | 'requester',
    now: number,
    tokens: number,
  ) {
    for (const [key, entry] of this.entries)
      if (entry.expires <= now) this.entries.delete(key);
    const policies: [string, number, number, number][] = [
      [`${feature}:hour:${userId}`, feature === 'manager' ? 10 : 5, 3600000, 1],
      [
        `${feature}:day:${userId}`,
        feature === 'manager' ? 25 : 10,
        86400000,
        1,
      ],
      ['minute:global', 12, 60000, 1],
      ['day:global', 400, 86400000, 1],
      ['tokens:global', 225000, 60000, tokens],
    ];
    const retry = Math.max(
      0,
      ...policies.map(([key, limit, duration, weight]) => {
        const entry = this.entries.get(key);
        return (entry?.count ?? 0) + weight > limit
          ? Math.ceil(((entry?.expires ?? now + duration) - now) / 1000)
          : 0;
      }),
    );
    if (
      retry ||
      this.entries.size +
        policies.filter(([key]) => !this.entries.has(key)).length >
        10002
    )
      throw new HttpException(
        {
          message: 'AI generation limit reached. Please try again later.',
          retryAfter: retry || 60,
        },
        429,
      );
    for (const [key, , duration, weight] of policies) {
      const entry = this.entries.get(key) ?? {
        count: 0,
        expires: now + duration,
      };
      entry.count += weight;
      this.entries.set(key, entry);
    }
  }
}
