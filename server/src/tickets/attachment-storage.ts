import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

export type Upload = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};
export type StoredUpload = {
  filename: string;
  contentType: string;
  byteSize: number;
  storageKey: string;
  digest: string;
};
export type UploadBatch = { files: StoredUpload[]; used: boolean };
export const attachmentSelect = {
  id: true,
  filename: true,
  contentType: true,
  byteSize: true,
  createdAt: true,
  deletedAt: true,
} as const;
export function attachmentView<
  T extends {
    deletedAt: Date | null;
    filename: string;
    contentType: string;
    byteSize: number;
  },
>(file: T) {
  return file.deletedAt
    ? { ...file, filename: null, contentType: null, byteSize: null }
    : file;
}

const types: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.json': 'application/json',
  '.csv': 'text/csv',
};
export function validateUpload(file: Upload): Omit<StoredUpload, 'storageKey'> {
  if (file.buffer.length > 10 * 1024 * 1024)
    throw new BadRequestException('Maximum file size is 10 MB');
  const filename = file.originalname
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    // eslint-disable-next-line no-control-regex -- Intentionally replace control bytes in untrusted filenames.
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_')
    .replace(/^\.+|[. ]+$/g, '')
    .slice(-200);
  const extension = extname(filename).toLowerCase();
  const contentType = types[extension];
  if (
    !contentType ||
    !filename ||
    (file.mimetype !== contentType &&
      file.mimetype !== 'application/octet-stream' &&
      !(extension === '.csv' && file.mimetype === 'application/vnd.ms-excel'))
  )
    throw new BadRequestException('Unsupported attachment type');
  const b = file.buffer;
  let valid = true;
  if (extension === '.png')
    valid = b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  else if (extension === '.jpg' || extension === '.jpeg')
    valid = b[0] === 255 && b[1] === 216 && b[2] === 255;
  else if (extension === '.webp')
    valid =
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP';
  else if (extension === '.pdf') valid = b.toString('ascii', 0, 5) === '%PDF-';
  else {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(b);
      valid =
        // eslint-disable-next-line no-control-regex -- Intentionally reject binary control bytes in text uploads.
        !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) &&
        !/^\s*(?:<!doctype\s+html|<html|<script|#!)/i.test(text);
      if (extension === '.json') JSON.parse(text);
    } catch {
      valid = false;
    }
  }
  if (!valid)
    throw new BadRequestException(
      'File content does not match an allowed format',
    );
  return {
    filename,
    contentType,
    byteSize: b.length,
    digest: createHash('sha256').update(b).digest('hex'),
  };
}

// Adapter boundary: only generated keys cross into storage. No public/static route.
export abstract class AttachmentStorage {
  abstract put(key: string, bytes: Buffer): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}
@Injectable()
export class LocalAttachmentStorage extends AttachmentStorage {
  private path(key: string) {
    if (!/^[0-9a-f-]{36}$/.test(key))
      throw new Error('Invalid storage identifier');
    return join(
      resolve(process.env.ATTACHMENT_STORAGE_DIR || '.attachments'),
      key,
    );
  }
  async put(key: string, bytes: Buffer) {
    const path = this.path(key);
    await mkdir(resolve(process.env.ATTACHMENT_STORAGE_DIR || '.attachments'), {
      recursive: true,
      mode: 0o700,
    });
    try {
      await writeFile(path + '.tmp', bytes, { flag: 'wx', mode: 0o600 });
      await rename(path + '.tmp', path);
    } catch (error) {
      await unlink(path + '.tmp').catch(() => undefined);
      throw error;
    }
  }
  read(key: string) {
    return readFile(this.path(key));
  }
  async remove(key: string) {
    await unlink(this.path(key)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
@Injectable()
export class AttachmentUploads {
  constructor(private readonly storage: AttachmentStorage) {}
  async run<T>(
    uploads: Upload[],
    operation: (batch: UploadBatch) => Promise<T>,
  ): Promise<T> {
    if (uploads.length > 5)
      throw new BadRequestException('Maximum 5 attachments');
    const files = uploads.map((upload) => ({
      ...validateUpload(upload),
      storageKey: randomUUID(),
    }));
    const batch = { files, used: false };
    let committed = false;
    try {
      for (let i = 0; i < files.length; i++)
        await this.storage.put(files[i].storageKey, uploads[i].buffer);
      const result = await operation(batch);
      committed = batch.used;
      return result;
    } finally {
      if (!committed) {
        const cleanup = await Promise.allSettled(
          files.map((file) => this.storage.remove(file.storageKey)),
        );
        if (cleanup.some((result) => result.status === 'rejected'))
          new Logger('AttachmentUploads').error(
            'Private orphan file cleanup failed; storage maintenance required',
          );
      }
    }
  }
}
