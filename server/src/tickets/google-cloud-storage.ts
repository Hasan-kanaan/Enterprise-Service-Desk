import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import {
  AttachmentStorage,
  LocalAttachmentStorage,
} from './attachment-storage';
import { storageConfig, StorageConfig } from './storage.config';

function missing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 404 || error.code === '404')
  );
}

// Credentials are resolved exclusively by the official client's ADC support.
// No ACLs, URLs, original filenames or application authorization live here.
export class GoogleCloudStorageAdapter extends AttachmentStorage {
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

  async put(key: string, bytes: Buffer): Promise<void> {
    try {
      await this.object(key).save(bytes, {
        resumable: false,
        validation: 'crc32c',
        metadata: { contentType: 'application/octet-stream' },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    } catch {
      throw new ServiceUnavailableException('Attachment storage upload failed');
    }
  }

  async read(key: string): Promise<Buffer> {
    try {
      const [bytes] = await this.object(key).download({ validation: 'crc32c' });
      return bytes;
    } catch (error) {
      if (missing(error)) throw new NotFoundException('Attachment unavailable');
      throw new ServiceUnavailableException(
        'Attachment storage download failed',
      );
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.object(key).delete();
    } catch (error) {
      if (!missing(error))
        throw new ServiceUnavailableException(
          'Attachment storage cleanup failed',
        );
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
