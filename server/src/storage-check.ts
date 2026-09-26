import { randomUUID } from 'node:crypto';
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
  console.log('Storage upload/read/delete check passed');
}
void check().catch(() => {
  console.error(
    'Storage check failed. Check provider configuration, ADC, bucket access and object retention policy. No fallback was used.',
  );
  process.exitCode = 1;
});
