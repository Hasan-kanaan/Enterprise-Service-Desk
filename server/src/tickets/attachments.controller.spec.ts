import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentStorage } from './attachment-storage';
import { TicketVisibilityService } from './ticket-visibility.service';

function setup(stream = Readable.from([Buffer.from('%PDF-1.7')])) {
  const file = {
    id: 12,
    ticketId: 9,
    messageId: null,
    internalNoteId: null,
    message: null,
    internalNote: null,
    deletedAt: null,
    storageKey: '12345678-1234-1234-1234-123456789abc',
    filename: 'report.pdf',
    contentType: 'application/pdf',
    byteSize: 8,
  };
  const database = {
    attachment: { findUnique: jest.fn().mockResolvedValue(file) },
    ticket: { findFirst: jest.fn().mockResolvedValue({ id: 9 }) },
  };
  const prisma = {
    $transaction: jest.fn(
      (operation: (transaction: typeof database) => Promise<unknown>) =>
        operation(database),
    ),
  };
  const visibility = { buildWhere: jest.fn().mockReturnValue({}) };
  const storage = { stream: jest.fn().mockReturnValue(stream) };
  const controller = new AttachmentsController(
    prisma as unknown as PrismaService,
    visibility as unknown as TicketVisibilityService,
    storage as unknown as AttachmentStorage,
  );
  const setHeader = jest.fn();
  const response = { setHeader } as unknown as Response;
  return { controller, file, storage, response, setHeader };
}

describe('Attachment streaming downloads', () => {
  it('starts streaming authorized bytes with the stored type and size', async () => {
    const { controller, file, storage, response, setHeader } = setup();
    const result = await controller.download(
      12,
      { user: { sub: 4, role: UserRole.EMPLOYEE } },
      response,
    );

    expect(result).toBeInstanceOf(StreamableFile);
    expect(result.getHeaders()).toMatchObject({
      type: file.contentType,
      length: file.byteSize,
    });
    expect(storage.stream).toHaveBeenCalledWith(file.storageKey);
    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });

  it.each([
    [{ code: 404 }, 404, 'Attachment unavailable'],
    [{ code: 403 }, 503, 'Attachment storage download failed'],
  ])(
    'maps stream errors to safe status and text',
    async (failure, status, message) => {
      const { controller, response } = setup();
      const result = await controller.download(
        12,
        { user: { sub: 4, role: UserRole.EMPLOYEE } },
        response,
      );
      const send = jest.fn();
      const streamResponse = {
        destroyed: false,
        headersSent: false,
        statusCode: 200,
        send,
        end: jest.fn(),
      } as Parameters<typeof result.errorHandler>[1];

      result.errorHandler(
        Object.assign(new Error('private storage path'), failure),
        streamResponse,
      );

      expect(streamResponse.statusCode).toBe(status);
      expect(send).toHaveBeenCalledWith(
        JSON.stringify({ statusCode: status, message }),
      );
      expect(JSON.stringify(send.mock.calls)).not.toContain(
        'private storage path',
      );
    },
  );
});
