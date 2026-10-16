import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mp4Fixture, webmFixture, box } from '../../test/video-fixtures';
import {
  validateUpload,
  AttachmentUploads,
  VIDEO_LIMIT,
  ATTACHMENT_BATCH_LIMIT,
} from './attachment-storage';
import { boundedAttachmentStorage } from './attachment-upload.interceptor';
import { validVideo } from './video-validation';

const upload = (
  extension: string,
  buffer: Buffer,
  mimetype = `video/${extension}`,
) => ({
  originalname: `evidence.${extension}`,
  mimetype,
  buffer,
  size: buffer.length,
});
describe('Conservative private video attachments', () => {
  it.each(['mp4', 'webm'] as const)(
    'accepts actual browser-encoded %s evidence',
    (extension) => {
      const bytes = readFileSync(
        join(__dirname, '../../test/fixtures', `browser-evidence.${extension}`),
      );
      expect(validateUpload(upload(extension, bytes)).byteSize).toBe(
        bytes.length,
      );
    },
  );
  it('rejects external MP4 media references', () => {
    const bytes = mp4Fixture();
    const reference = bytes.indexOf(Buffer.from('url '));
    bytes.writeUInt32BE(0, reference + 4);
    expect(validVideo(bytes, '.mp4')).toBe(false);
  });
  it.each([
    ['mp4', mp4Fixture()],
    ['webm', webmFixture()],
  ] as const)(
    'accepts structural %s with canonical MIME',
    (extension, bytes) => {
      expect(validateUpload(upload(extension, bytes))).toMatchObject({
        contentType: `video/${extension}`,
        byteSize: bytes.length,
      });
    },
  );
  it.each(['text/plain', 'video/webm', 'application/octet-stream'])(
    'rejects MP4 MIME mismatch %s',
    (mime) => {
      expect(() => validateUpload(upload('mp4', mp4Fixture(), mime))).toThrow();
    },
  );
  it.each(['mov', 'mkv', 'avi'])(
    'rejects unapproved %s containers',
    (extension) => {
      expect(() => validateUpload(upload(extension, mp4Fixture()))).toThrow();
    },
  );
  it('rejects signatures alone, renamed executable, audio-only and appended polyglots', () => {
    const audio = mp4Fixture();
    audio.write('soun', audio.indexOf(Buffer.from('vide')));
    const matroska = webmFixture();
    matroska.write('mkv!', matroska.indexOf(Buffer.from('webm')));
    for (const [extension, bytes] of [
      ['mp4', Buffer.from('MZ executable')],
      ['webm', Buffer.from('<html>bad</html>')],
      ['mp4', box('ftyp', Buffer.from('isom\0\0\0\0isom'))],
      ['mp4', audio],
      ['webm', matroska],
      [
        'mp4',
        Buffer.concat([mp4Fixture(), Buffer.from('<script>bad</script>')]),
      ],
      ['webm', Buffer.concat([webmFixture(), Buffer.from('PK\x03\x04')])],
    ] as const)
      expect(validVideo(bytes, `.${extension}`)).toBe(false);
  });
  it('rejects truncated or overflowing structures at every truncation boundary', () => {
    for (const [extension, bytes] of [
      ['mp4', mp4Fixture()],
      ['webm', webmFixture()],
    ] as const)
      for (let i = 0; i < bytes.length; i++)
        expect(validVideo(bytes.subarray(0, i), `.${extension}`)).toBe(false);
    const huge = mp4Fixture();
    huge.writeUInt32BE(0xffffffff);
    expect(validVideo(huge, '.mp4')).toBe(false);
  });
  it('enforces inclusive 25 MiB video and retained 10 MiB non-video bounds using bytes', () => {
    expect(
      validateUpload(upload('mp4', mp4Fixture(VIDEO_LIMIT))).byteSize,
    ).toBe(VIDEO_LIMIT);
    expect(() =>
      validateUpload(upload('mp4', mp4Fixture(VIDEO_LIMIT + 1))),
    ).toThrow('Maximum file size');
    expect(() =>
      validateUpload(
        upload('txt', Buffer.alloc(10 * 1024 * 1024 + 1), 'text/plain'),
      ),
    ).toThrow('Maximum file size');
  });
  it('rejects aggregate overflow before any storage/database work', async () => {
    const storage = { put: jest.fn(), read: jest.fn(), remove: jest.fn() },
      operation = jest.fn();
    await expect(
      new AttachmentUploads(storage).run(
        [
          upload('mp4', mp4Fixture(VIDEO_LIMIT)),
          upload('mp4', mp4Fixture(VIDEO_LIMIT)),
          upload('txt', Buffer.from('x'), 'text/plain'),
        ],
        operation,
      ),
    ).rejects.toThrow('50 MiB');
    expect(storage.put).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });
  it('accepts the inclusive 50 MiB aggregate without relaxing the five-file bound', async () => {
    const storage = { put: jest.fn(), read: jest.fn(), remove: jest.fn() };
    const uploads = new AttachmentUploads(storage);
    const video = upload('mp4', mp4Fixture(VIDEO_LIMIT));
    await expect(
      uploads.run([video, video], (batch) => {
        batch.used = true;
        return Promise.resolve(
          batch.files.reduce((sum, file) => sum + file.byteSize, 0),
        );
      }),
    ).resolves.toBe(ATTACHMENT_BATCH_LIMIT);
    await expect(
      uploads.run(
        Array.from({ length: 6 }, () => upload('webm', webmFixture())),
        jest.fn(),
      ),
    ).rejects.toThrow('Maximum 5 attachments');
  });
  it('bounds chunked multipart buffering across files before reading the full next video', async () => {
    const req = {};
    const store = (size: number) =>
      new Promise<Buffer>((resolve, reject) => {
        boundedAttachmentStorage._handleFile(
          req,
          {
            originalname: 'evidence.mp4',
            stream: Readable.from(
              (function* () {
                for (let i = 0; i < size; i += 1024 * 1024)
                  yield Buffer.alloc(Math.min(1024 * 1024, size - i));
              })(),
            ),
          },
          (error, info) => (error ? reject(error) : resolve(info!.buffer)),
        );
      });
    await store(VIDEO_LIMIT);
    await store(VIDEO_LIMIT);
    await expect(store(1)).rejects.toThrow('Attachment size limit exceeded');
    expect(ATTACHMENT_BATCH_LIMIT).toBe(2 * VIDEO_LIMIT);
  });
});
