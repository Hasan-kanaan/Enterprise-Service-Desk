export type RatePolicy = { limit: number; windowMs: number };

// Single-process fixed windows. Never evict an active key to admit an attacker.
export class RateLimiter {
  private readonly entries = new Map<
    string,
    { count: number; expires: number }
  >();
  private nextCleanup = 0;
  constructor(
    private readonly maxKeys: number,
    private readonly now = Date.now,
  ) {}

  consume(key: string, policy: RatePolicy): number {
    const now = this.now();
    if (now >= this.nextCleanup) {
      for (const [key, value] of this.entries)
        if (value.expires <= now) this.entries.delete(key);
      this.nextCleanup = now + 1000;
    }
    let entry = this.entries.get(key);
    if (entry && entry.expires <= now) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (!entry) {
      if (this.entries.size >= this.maxKeys) return 1;
      entry = { count: 0, expires: now + policy.windowMs };
      this.entries.set(key, entry);
    }
    if (entry.count >= policy.limit)
      return Math.max(1, Math.ceil((entry.expires - now) / 1000));
    entry.count++;
    return 0;
  }
}
