import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { constants, createReadStream } from 'node:fs';
import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { storageConfig, StorageConfig } from '../tickets/storage.config';

const STORAGE_NAMESPACE = 'company-knowledge';
const STORAGE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export abstract class CompanyKnowledgeStorage {
  abstract put(key: string, sourcePath: string): Promise<void>;
  abstract stream(key: string): Readable;
  abstract remove(key: string): Promise<void>;
}

function assertKey(key: string) {
  if (!STORAGE_ID.test(key))
    throw new ServiceUnavailableException(
      'Company document storage unavailable',
    );
}

function missingObject(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : undefined;
  return code === 404 || code === '404' || code === 'ENOENT';
}

export class LocalCompanyKnowledgeStorage extends CompanyKnowledgeStorage {
  private readonly directory: string;

  constructor(directory: string) {
    super();
    this.directory = join(directory, STORAGE_NAMESPACE);
  }

  private path(key: string) {
    assertKey(key);
    return join(this.directory, key);
  }

  async put(key: string, sourcePath: string) {
    const path = this.path(key);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await copyFile(sourcePath, path + '.tmp', constants.COPYFILE_EXCL);
      await rename(path + '.tmp', path);
    } catch (error) {
      await unlink(path + '.tmp').catch(() => undefined);
      throw error;
    }
  }

  stream(key: string) {
    return createReadStream(this.path(key));
  }

  async remove(key: string) {
    await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export class GoogleCloudCompanyKnowledgeStorage extends CompanyKnowledgeStorage {
  private readonly logger = new Logger(GoogleCloudCompanyKnowledgeStorage.name);

  constructor(
    private readonly client: Storage,
    private readonly bucketName: string,
  ) {
    super();
  }

  private object(key: string) {
    assertKey(key);
    return this.client
      .bucket(this.bucketName)
      .file(`${STORAGE_NAMESPACE}/${key}`);
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
    this.logger.error(
      `Company document storage ${operation} failed: code=${code}`,
    );
  }

  async put(key: string, sourcePath: string) {
    try {
      await pipeline(
        createReadStream(sourcePath),
        this.object(key).createWriteStream({
          resumable: true,
          preconditionOpts: { ifGenerationMatch: 0 },
          validation: 'crc32c',
          metadata: { contentType: 'application/octet-stream' },
        }),
      );
    } catch (error) {
      this.logFailure('upload', error);
      throw new ServiceUnavailableException(
        'Company document storage upload failed',
      );
    }
  }

  stream(key: string) {
    const stream = this.object(key).createReadStream({ validation: 'crc32c' });
    stream.on('error', (error: unknown) => {
      if (!missingObject(error)) this.logFailure('download', error);
    });
    return stream;
  }

  async remove(key: string) {
    try {
      await this.object(key).delete();
    } catch (error) {
      if (missingObject(error)) return;
      this.logFailure('cleanup', error);
      throw new ServiceUnavailableException(
        'Company document storage cleanup failed',
      );
    }
  }
}

export function createCompanyKnowledgeStorage(
  config: StorageConfig = storageConfig(),
): CompanyKnowledgeStorage {
  if (config.provider === 'local')
    return new LocalCompanyKnowledgeStorage(config.directory);
  return new GoogleCloudCompanyKnowledgeStorage(
    new Storage(config.projectId ? { projectId: config.projectId } : {}),
    config.bucket,
  );
}

export function isMissingCompanyKnowledgeObject(error: unknown) {
  return missingObject(error);
}
