// Synthetic structural fixtures; not claims of codec decoding or playback.
export function box(type: string, ...parts: Buffer[]) {
  const data = Buffer.concat(parts),
    header = Buffer.alloc(8);
  header.writeUInt32BE(data.length + 8);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, data]);
}
export function mp4Fixture(size?: number) {
  const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isommp42', 'latin1'));
  const handler = Buffer.alloc(24);
  handler.write('vide', 8);
  const entry = Buffer.alloc(78);
  entry.writeUInt16BE(1, 6);
  entry.writeUInt16BE(16, 24);
  entry.writeUInt16BE(16, 26);
  const stsd = Buffer.alloc(8);
  stsd.writeUInt32BE(1, 4);
  const stsz = Buffer.alloc(12);
  stsz.writeUInt32BE(4, 4);
  stsz.writeUInt32BE(1, 8);
  const stco = Buffer.alloc(12);
  stco.writeUInt32BE(1, 4);
  stco.writeUInt32BE(ftyp.length + 8, 8);
  const moov = box(
    'moov',
    box('mvhd', Buffer.alloc(100)),
    box(
      'trak',
      box('tkhd', Buffer.alloc(84)),
      box(
        'mdia',
        box('mdhd', Buffer.alloc(24)),
        box('hdlr', handler),
        box(
          'minf',
          box(
            'dinf',
            box(
              'dref',
              Buffer.from([0, 0, 0, 0, 0, 0, 0, 1]),
              box('url ', Buffer.from([0, 0, 0, 1])),
            ),
          ),
          box(
            'stbl',
            box(
              'stsd',
              stsd,
              box(
                'avc1',
                entry,
                box('avcC', Buffer.from([1, 66, 0, 30, 255, 225, 0])),
              ),
            ),
            box('stsz', stsz),
            box('stco', stco),
          ),
        ),
      ),
    ),
  );
  const mediaLength = size ? size - ftyp.length - moov.length - 8 : 4;
  return Buffer.concat([ftyp, box('mdat', Buffer.alloc(mediaLength, 1)), moov]);
}
export function ebml(id: string, ...parts: Buffer[]) {
  const payload = Buffer.concat(parts);
  if (payload.length >= 127) throw new Error('Small fixture elements only');
  return Buffer.concat([
    Buffer.from(id, 'hex'),
    Buffer.from([0x80 | payload.length]),
    payload,
  ]);
}
export function webmFixture() {
  return Buffer.concat([
    ebml('1a45dfa3', ebml('4282', Buffer.from('webm'))),
    ebml(
      '18538067',
      ebml('1549a966', ebml('2ad7b1', Buffer.from([0x0f, 0x42, 0x40]))),
      ebml(
        '1654ae6b',
        ebml(
          'ae',
          ebml('d7', Buffer.from([1])),
          ebml('83', Buffer.from([1])),
          ebml('86', Buffer.from('V_VP8')),
          ebml(
            'e0',
            ebml('b0', Buffer.from([16])),
            ebml('ba', Buffer.from([16])),
          ),
        ),
      ),
      ebml(
        '1f43b675',
        ebml('e7', Buffer.from([0])),
        ebml('a3', Buffer.from([0x81, 0, 0, 0x80, 1, 2, 3, 4])),
      ),
    ),
  ]);
}
