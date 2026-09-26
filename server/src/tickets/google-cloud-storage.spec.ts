import { Storage } from '@google-cloud/storage';
import { HttpException } from '@nestjs/common';
import {
  GoogleCloudStorageAdapter,
  createAttachmentStorage,
} from './google-cloud-storage';
import { LocalAttachmentStorage } from './attachment-storage';
import { storageConfig } from './storage.config';

jest.mock('@google-cloud/storage', () => ({ Storage: jest.fn() }));
const key = '12345678-1234-1234-1234-123456789abc';
describe('Google Cloud Storage (no network)', () => {
  const file = { save: jest.fn(), download: jest.fn(), delete: jest.fn() };
  const bucket = { file: jest.fn(() => file) };
  const client = { bucket: jest.fn(() => bucket) };
  let adapter: GoogleCloudStorageAdapter;
  beforeEach(() => {
    jest.clearAllMocks();
    file.save.mockReset().mockResolvedValue(undefined);
    file.download.mockReset().mockResolvedValue([Buffer.from('bytes')]);
    file.delete.mockReset().mockResolvedValue(undefined);
    adapter = new GoogleCloudStorageAdapter(
      client as unknown as Storage,
      'private-bucket',
    );
  });
  it('uploads opaque objects without ACLs, public URLs or filename metadata', async () => {
    await adapter.put(key, Buffer.from('bytes'));
    expect(client.bucket).toHaveBeenCalledWith('private-bucket');
    expect(bucket.file).toHaveBeenCalledWith(`attachments/${key}`);
    expect(file.save).toHaveBeenCalledWith(Buffer.from('bytes'), {
      resumable: false,
      validation: 'crc32c',
      metadata: { contentType: 'application/octet-stream' },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
  });
  it('reads bytes with checksum validation', async () => {
    await expect(adapter.read(key)).resolves.toEqual(Buffer.from('bytes'));
    expect(file.download).toHaveBeenCalledWith({ validation: 'crc32c' });
  });
  it('deletes and treats an already missing object as successful cleanup', async () => {
    await adapter.remove(key);
    file.delete.mockRejectedValueOnce({ code: 404 });
    await expect(adapter.remove(key)).resolves.toBeUndefined();
  });
  it('maps object-not-found to a safe 404', async () => {
    file.download.mockRejectedValueOnce({
      code: 404,
      message: 'private bucket/key',
    });
    await expect(adapter.read(key)).rejects.toMatchObject({
      status: 404,
      message: 'Attachment unavailable',
    });
  });
  it.each(['put', 'read', 'remove'] as const)(
    'sanitizes %s failures',
    async (operation) => {
      const error = Object.assign(
        new Error('secret credentials bucket/key local/path'),
        { code: 403 },
      );
      file.save.mockRejectedValue(error);
      file.download.mockRejectedValue(error);
      file.delete.mockRejectedValue(error);
      const result = adapter[operation](key, Buffer.from('bytes'));
      await expect(result).rejects.toBeInstanceOf(HttpException);
      await expect(result).rejects.toMatchObject({ status: 503 });
      await result.catch((failure: HttpException) => {
        expect(JSON.stringify(failure)).not.toMatch(
          /secret|credentials|bucket\/key|local\/path/,
        );
        expect(failure.cause).toBeUndefined();
      });
    },
  );
  it('rejects non-opaque keys without contacting the client', async () => {
    await expect(adapter.read('../private.txt')).rejects.toMatchObject({
      status: 503,
    });
    expect(client.bucket).not.toHaveBeenCalled();
  });
});

describe('Storage configuration and provider selection', () => {
  beforeEach(() => jest.clearAllMocks());
  it('defaults to local without Google configuration or client creation', () => {
    expect(createAttachmentStorage(storageConfig({}))).toBeInstanceOf(
      LocalAttachmentStorage,
    );
    expect(Storage).not.toHaveBeenCalled();
  });
  it('selects explicit local and ignores Google settings', () => {
    expect(
      createAttachmentStorage(
        storageConfig({
          STORAGE_PROVIDER: 'local',
          GCS_BUCKET_NAME: 'invalid/name',
        }),
      ),
    ).toBeInstanceOf(LocalAttachmentStorage);
  });
  it.each([undefined, 'project-id'])(
    'selects GCS using ADC, optional project=%s',
    (projectId) => {
      expect(
        createAttachmentStorage(
          storageConfig({
            STORAGE_PROVIDER: 'gcs',
            GCS_BUCKET_NAME: 'private-bucket',
            GCS_PROJECT_ID: projectId,
          }),
        ),
      ).toBeInstanceOf(GoogleCloudStorageAdapter);
      expect(Storage).toHaveBeenCalledWith(projectId ? { projectId } : {});
    },
  );
  it.each([undefined, '', 'gs://bucket', 'bucket/path'])(
    'rejects missing/invalid bucket %s',
    (bucket) => {
      expect(() =>
        storageConfig({ STORAGE_PROVIDER: 'gcs', GCS_BUCKET_NAME: bucket }),
      ).toThrow('GCS_BUCKET_NAME');
    },
  );
  it('rejects unsupported providers and empty local paths', () => {
    expect(() => storageConfig({ STORAGE_PROVIDER: 's3' })).toThrow(
      'STORAGE_PROVIDER',
    );
    expect(() => storageConfig({ ATTACHMENT_STORAGE_DIR: '' })).toThrow(
      'ATTACHMENT_STORAGE_DIR',
    );
  });
});
