import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Readable } from 'node:stream';
import {
  ATTACHMENT_BATCH_LIMIT,
  VIDEO_LIMIT,
  uploadLimit,
} from './attachment-storage';

// Count bytes as Multer consumes file streams, including chunked requests.
// Never buffer five full videos before discovering the aggregate limit.
const totals = new WeakMap<object, number>();
export const boundedAttachmentStorage = {
  _handleFile(
    req: object,
    file: { originalname: string; stream: Readable },
    callback: (
      error: Error | null,
      info?: { buffer: Buffer; size: number },
    ) => void,
  ) {
    let chunks: Buffer[] = [],
      size = 0,
      done = false;
    const fail = (error: Error) => {
      if (done) return;
      done = true;
      chunks = [];
      callback(error);
    };
    file.stream.on('data', (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      const total = (totals.get(req) ?? 0) + chunk.length;
      totals.set(req, total);
      if (
        size > uploadLimit(file.originalname) ||
        total > ATTACHMENT_BATCH_LIMIT
      ) {
        fail(new PayloadTooLargeException('Attachment size limit exceeded'));
        return;
      }
      chunks.push(chunk);
    });
    file.stream.on('error', fail);
    file.stream.on('end', () => {
      if (done) return;
      done = true;
      callback(null, { buffer: Buffer.concat(chunks, size), size });
      chunks = [];
    });
  },
  _removeFile(
    _req: object,
    file: { buffer?: Buffer },
    callback: (error: Error | null) => void,
  ) {
    delete file.buffer;
    callback(null);
  },
};

export const AttachmentFilesInterceptor = FilesInterceptor('files', 5, {
  storage: boundedAttachmentStorage,
  limits: {
    fileSize: VIDEO_LIMIT,
    files: 5,
    fields: 1,
    fieldSize: 64 * 1024,
    // One payload + five files; Multer 2.4 also applies inclusive part limits.
    parts: 6,
  },
});
// Multipart carries a JSON `payload` field plus files, keeping DTO validation
// identical to JSON requests (including strict unknown-field rejection).
@Injectable()
export class AttachmentPayloadInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context
      .switchToHttp()
      .getRequest<{ is: (type: string) => boolean; body: unknown }>();
    if (req.is('multipart/form-data')) {
      const body = req.body as Record<string, unknown>;
      if (Object.keys(body).length !== 1 || typeof body.payload !== 'string')
        throw new BadRequestException(
          'Multipart requires one JSON payload field',
        );
      try {
        req.body = JSON.parse(body.payload);
      } catch {
        throw new BadRequestException('Invalid JSON payload');
      }
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
        throw new BadRequestException('Payload must be an object');
    }
    return next.handle();
  }
}
