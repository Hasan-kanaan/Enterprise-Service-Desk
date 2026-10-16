import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { AnalyticsQueryDto } from './analytics.dto';
import { analyticsRange } from './analytics.service';

describe('Analytics bounds', () => {
  const now = new Date('2026-10-16T12:34:56.000Z');
  it.each(['7', '30', '90'])('uses exactly %s elapsed days in UTC', (days) => {
    const range = analyticsRange({ days }, now);
    expect(range.to).toEqual(now);
    expect(range.to.getTime() - range.from.getTime()).toBe(
      Number(days) * 86400000,
    );
  });
  it('defaults to a bounded 30-day window', () => {
    expect(analyticsRange({}, now).days).toBe(30);
  });
  it.each(['0', '-1', '365', '7 OR 1=1', '', '07'])(
    'rejects %j',
    async (days) => {
      expect(() => analyticsRange({ days }, now)).toThrow(BadRequestException);
      expect(
        await validate(Object.assign(new AnalyticsQueryDto(), { days })),
      ).toHaveLength(1);
    },
  );
});
