import { BadRequestException } from '@nestjs/common';
import { Type, Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  search?: string;
}

type Position = { id: number; createdAt?: Date };
export function listWindow(query: ListQuery, dated = true) {
  const limit = query.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new BadRequestException('Page size must be between 1 and 100');
  if (
    query.search !== undefined &&
    (typeof query.search !== 'string' ||
      query.search.length > 120 ||
      query.search.includes('\u0000'))
  )
    throw new BadRequestException(
      'Search must be at most 120 characters and contain no null bytes',
    );
  let position: Position | undefined;
  if (query.cursor !== undefined) {
    try {
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(query.cursor)) throw new Error();
      const value: unknown = JSON.parse(
        Buffer.from(query.cursor, 'base64url').toString(),
      );
      if (
        !Array.isArray(value) ||
        value.length !== (dated ? 3 : 2) ||
        value[0] !== 1 ||
        !Number.isSafeInteger(value[1]) ||
        Number(value[1]) < 1 ||
        Number(value[1]) > 2147483647
      )
        throw new Error();
      position = { id: Number(value[1]) };
      if (dated) {
        if (typeof value[2] !== 'string') throw new Error();
        const date = new Date(value[2]);
        if (
          date.toISOString() !== value[2] ||
          date.getUTCFullYear() < 1 ||
          date.getUTCFullYear() > 9999
        )
          throw new Error();
        position.createdAt = date;
      }
    } catch {
      throw new BadRequestException('Invalid list cursor');
    }
  }
  // Prisma contains uses LIKE internally: treat user wildcards as literal text.
  const search = query.search?.trim().replace(/[\\%_]/g, '\\$&') || undefined;
  return { limit, position, search };
}

export function after(position?: Position) {
  if (!position) return {};
  if (!position.createdAt) return { id: { lt: position.id } };
  return {
    OR: [
      { createdAt: { lt: position.createdAt } },
      { createdAt: position.createdAt, id: { lt: position.id } },
    ],
  };
}

export function listPage<T extends { id: number; createdAt?: Date }>(
  rows: T[],
  limit: number,
  dated = true,
) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify(
              dated
                ? [1, last.id, last.createdAt!.toISOString()]
                : [1, last.id],
            ),
          ).toString('base64url')
        : null,
  };
}
