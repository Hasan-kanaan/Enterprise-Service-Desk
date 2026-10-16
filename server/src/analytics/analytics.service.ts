import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsQueryDto, AnalyticsResponse } from './analytics.dto';
import { analyticsSql } from './analytics.query';

export function analyticsRange(query: AnalyticsQueryDto, now = new Date()) {
  const days = query.days ?? '30';
  if (!['7', '30', '90'].includes(days))
    throw new BadRequestException('Choose 7, 30 or 90 days');
  return {
    days: Number(days),
    from: new Date(now.getTime() - Number(days) * 86400000),
    to: now,
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(
    query: AnalyticsQueryDto,
    now = new Date(),
  ): Promise<AnalyticsResponse> {
    const range = analyticsRange(query, now);
    // One statement gives every aggregate the same PostgreSQL snapshot.
    const [row] = await this.prisma.$queryRaw<
      { data: Omit<AnalyticsResponse, 'range'> }[]
    >(analyticsSql(range.from, range.to));
    return {
      ...row.data,
      range: {
        days: range.days,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timezone: 'UTC',
      },
    };
  }
}
