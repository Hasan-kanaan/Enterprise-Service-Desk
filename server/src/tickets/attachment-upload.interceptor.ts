import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

export const AttachmentFilesInterceptor = FilesInterceptor('files', 5, {
  limits: {
    // Busboy emits limit at equality; validateUpload enforces the inclusive 10 MB cap.
    fileSize: 10 * 1024 * 1024 + 1,
    files: 5,
    fields: 1,
    fieldSize: 64 * 1024,
    // One payload + five files; Busboy counts the final boundary toward this limit.
    parts: 7,
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
