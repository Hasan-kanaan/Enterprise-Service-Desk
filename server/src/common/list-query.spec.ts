import { BadRequestException } from '@nestjs/common';
import { after, listPage, listWindow } from './list-query';

describe('Keyset continuation', () => {
  it('round trips a tuple without consulting a boundary record', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const first = listPage(
      [
        { id: 4, createdAt: date },
        { id: 3, createdAt: date },
      ],
      1,
    );
    const position = listWindow({ cursor: first.nextCursor! }).position;
    expect(after(position)).toEqual({
      OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: 4 } }],
    });
    expect(listPage([{ id: 3, createdAt: date }], 1).nextCursor).toBeNull();
  });

  it('uses ID ordering for mutable directory labels', () => {
    const result = listPage([{ id: 8 }, { id: 7 }], 1, false);
    expect(
      after(listWindow({ cursor: result.nextCursor! }, false).position),
    ).toEqual({ id: { lt: 8 } });
  });

  it('treats LIKE wildcard characters literally and whitespace as no search', () => {
    expect(listWindow({ search: '  %_\\  ' }).search).toBe('\\%\\_\\\\');
    expect(listWindow({ search: '   ' }).search).toBeUndefined();
  });

  it.each([0, -1, 101, 1.5, Infinity])(
    'rejects invalid page size %s',
    (limit) => {
      expect(() => listWindow({ limit })).toThrow(BadRequestException);
    },
  );

  it('rejects cursor type confusion, oversized values and excessive search', () => {
    for (const cursor of [
      '',
      'x'.repeat(257),
      Buffer.from('[1,"5"]', 'utf8').toString('base64url'),
      Buffer.from('[1,2147483648]', 'utf8').toString('base64url'),
    ]) {
      expect(() => listWindow({ cursor }, false)).toThrow(BadRequestException);
    }
    expect(() => listWindow({ search: 'x'.repeat(121) })).toThrow(
      BadRequestException,
    );
    expect(() => listWindow({ search: '\u0000' })).toThrow(BadRequestException);
    for (const date of [
      '0000-01-01T00:00:00.000Z',
      '-271821-04-20T00:00:00.000Z',
    ]) {
      const cursor = Buffer.from(JSON.stringify([1, 1, date])).toString(
        'base64url',
      );
      expect(() => listWindow({ cursor })).toThrow(BadRequestException);
    }
  });
});
