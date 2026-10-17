import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { createAttachmentStorage } from './tickets/google-cloud-storage';

// Explicit operator command, never invoked by application startup or tests.
async function check() {
  const storage = createAttachmentStorage();
  const key = randomUUID();
  const bytes = Buffer.from('Service Desk storage check');
  try {
    await storage.put(key, bytes);
    if (!(await storage.read(key)).equals(bytes)) throw new Error('Mismatch');
  } finally {
    await storage.remove(key);
  }
  // Distinguish confirmed absence from permission/network errors after deletion.
  let removed = false;
  try {
    await storage.read(key);
  } catch (error) {
    if (
      error instanceof NotFoundException ||
      (error instanceof Error && 'code' in error && error.code === 'ENOENT')
    )
      removed = true;
    else throw error;
  }
  if (!removed) throw new Error('Probe still readable after deletion');
  console.log(
    'Storage upload/read/content-match/delete check passed; probe absence confirmed',
  );
}
void check().catch(() => {
  console.error(
    'Storage check failed. Check provider configuration, ADC, bucket access and object retention policy. No fallback was used.',
  );
  process.exitCode = 1;
});
