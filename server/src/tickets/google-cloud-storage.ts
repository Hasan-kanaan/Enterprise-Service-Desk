import {
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import {
  AttachmentStorage,
  isMissingAttachmentError,
  LocalAttachmentStorage,
} from './attachment-storage';
import { storageConfig, StorageConfig } from './storage.config';

// Credentials are resolved exclusively by the official client's ADC support.
// No ACLs, URLs, original filenames or application authorization live here.
export class GoogleCloudStorageAdapter extends AttachmentStorage {
  private readonly logger = new Logger(GoogleCloudStorageAdapter.name);

  constructor(
    private readonly client: Storage,
    private readonly bucket: string,
  ) {
    super();
  }

  private object(key: string) {
    if (!/^[0-9a-f-]{36}$/.test(key))
      throw new ServiceUnavailableException('Attachment storage unavailable');
    return this.client.bucket(this.bucket).file(`attachments/${key}`);
  }

  private logFailure(operation: string, error: unknown) {
    const rawCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? error.code
        : undefined;
    const code =
      typeof rawCode === 'number' ||
      (typeof rawCode === 'string' && /^[A-Z0-9_]{1,32}$/.test(rawCode))
        ? String(rawCode)
        : 'unknown';
    this.logger.error(`GCS attachment ${operation} failed: code=${code}`);
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.object(key).save(bytes, {
        resumable: false,
        validation: 'crc32c',
        metadata: { contentType: 'application/octet-stream' },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch (error) {
      this.logFailure('upload', error);
      throw new ServiceUnavailableException('Attachment storage upload failed');
    }
  }

  async read(key: string): Promise<Buffer> {
    try {
      const [bytes] = await this.object(key).download({ validation: 'crc32c' });
      return bytes;
    } catch (error) {
      if (isMissingAttachmentError(error))
        throw new NotFoundException('Attachment unavailable');
      this.logFailure('download', error);
      throw new ServiceUnavailableException(
        'Attachment storage download failed',
      );
    }
  }

  stream(key: string) {
    const stream = this.object(key).createReadStream({ validation: 'crc32c' });
    stream.on('error', (error: unknown) => {
      if (!isMissingAttachmentError(error)) this.logFailure('download', error);
    });
    return stream;
  }

  async remove(key: string): Promise<void> {
    try {
      await this.object(key).delete();
    } catch (error) {
      if (!isMissingAttachmentError(error)) {
        this.logFailure('delete', error);
        throw new ServiceUnavailableException(
          'Attachment storage cleanup failed',
        );
      }
    }
  }
}

export function createAttachmentStorage(
  config: StorageConfig = storageConfig(),
): AttachmentStorage {
  if (config.provider === 'local')
    return new LocalAttachmentStorage(config.directory);
  return new GoogleCloudStorageAdapter(
    new Storage(config.projectId ? { projectId: config.projectId } : {}),
    config.bucket,
  );
}
