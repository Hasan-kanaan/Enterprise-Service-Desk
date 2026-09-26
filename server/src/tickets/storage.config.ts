import { resolve } from 'node:path';

export type StorageConfig =
  | { provider: 'local'; directory: string }
  | { provider: 'gcs'; bucket: string; projectId?: string };

export function storageConfig(
  env: NodeJS.ProcessEnv = process.env,
): StorageConfig {
  const provider = env.STORAGE_PROVIDER ?? 'local';
  if (provider === 'local') {
    const directory = env.ATTACHMENT_STORAGE_DIR ?? '.attachments';
    if (!directory.trim() || directory.includes('\0'))
      throw new Error('ATTACHMENT_STORAGE_DIR must be a nonempty directory');
    return { provider, directory: resolve(directory) };
  }
  if (provider !== 'gcs')
    throw new Error('STORAGE_PROVIDER must be local or gcs');
  const bucket = env.GCS_BUCKET_NAME;
  if (!bucket || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket))
    throw new Error(
      'GCS_BUCKET_NAME must be a valid bucket name when STORAGE_PROVIDER=gcs',
    );
  const projectId = env.GCS_PROJECT_ID?.trim();
  return { provider, bucket, ...(projectId ? { projectId } : {}) };
}
