import {
  AttachmentStorage,
  AttachmentUploads,
  validateUpload,
} from './attachment-storage';

const upload = (
  name: string,
  bytes: Buffer | string,
  mimetype = 'application/octet-stream',
) => ({
  originalname: name,
  buffer: Buffer.from(bytes),
  size: Buffer.byteLength(bytes),
  mimetype,
});
describe('Attachment file boundaries', () => {
  it.each([
    ['image.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image.jpeg', Buffer.from([255, 216, 255, 224])],
    ['image.webp', Buffer.from('RIFFxxxxWEBP')],
    ['report.pdf', Buffer.from('%PDF-1.7')],
    ['report.txt', 'plain text'],
    ['report.log', 'log\nline'],
    ['report.json', '{"ok":true}'],
    ['report.csv', 'a,b\n1,2'],
  ])('accepts %s and derives canonical metadata', (name, bytes) => {
    expect(validateUpload(upload(name, bytes))).toMatchObject({
      filename: name,
      byteSize: Buffer.byteLength(bytes),
    });
  });
  it('sanitizes path and control characters without using a filename as a storage key', () => {
    expect(
      validateUpload(upload('../../private\\report\r\n.txt', 'text')).filename,
    ).toBe('report__.txt');
  });
  it.each(['x.exe', 'x.html', 'x.js', 'x.zip', 'x.svg'])(
    'rejects %s regardless of claimed type',
    (name) => {
      expect(() =>
        validateUpload(upload(name, 'text', 'text/plain')),
      ).toThrow();
    },
  );
  it('rejects disguised binary, invalid UTF-8/JSON, HTML and mismatched MIME', () => {
    for (const file of [
      upload('x.txt', Buffer.from([0, 1, 2])),
      upload('x.txt', Buffer.from([255])),
      upload('x.json', '{'),
      upload('x.txt', '<html>bad</html>'),
      upload('x.png', 'not PNG'),
      upload('x.txt', 'plain', 'text/html'),
    ])
      expect(() => validateUpload(file)).toThrow();
  });
  it('enforces 10 MB using actual bytes', () => {
    expect(() =>
      validateUpload(upload('x.txt', Buffer.alloc(10485761, 65))),
    ).toThrow();
  });
  it('cleans earlier files and never calls the database when a later store fails', async () => {
    const storage: AttachmentStorage = {
      put: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('disk')),
      read: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const operation = jest.fn();
    await expect(
      new AttachmentUploads(storage).run(
        [upload('a.txt', 'a'), upload('b.txt', 'b')],
        operation,
      ),
    ).rejects.toThrow('disk');
    expect(operation).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledTimes(2);
  });
  it('cleans on commit failure even if the transaction callback marked files used', async () => {
    const storage: AttachmentStorage = {
      put: jest.fn(),
      read: jest.fn(),
      remove: jest.fn(),
    };
    await expect(
      new AttachmentUploads(storage).run(
        [upload('a.txt', 'a')],
        async (batch) => {
          batch.used = true;
          throw new Error('commit');
        },
      ),
    ).rejects.toThrow('commit');
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });
});
