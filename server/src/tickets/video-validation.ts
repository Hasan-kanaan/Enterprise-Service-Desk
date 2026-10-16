// Bounded container screening, not a decoder, transcoder or malware scanner.
// MP4RA box registry and WebM container guidelines are linked in the security report.
type Box = { type: string; start: number; end: number };
const invalid = () => {
  throw new Error('Invalid video container');
};

function mp4(bytes: Buffer) {
  let budget = 20000;
  const boxes = (start: number, end: number): Box[] => {
    const result: Box[] = [];
    while (start < end) {
      if (--budget < 0 || end - start < 8) invalid();
      let size = bytes.readUInt32BE(start);
      const type = bytes.toString('latin1', start + 4, start + 8);
      let header = 8;
      if (size === 1) {
        if (end - start < 16) invalid();
        const large = bytes.readBigUInt64BE(start + 8);
        if (large > BigInt(end - start)) invalid();
        size = Number(large);
        header = 16;
      }
      // Explicit sizes prevent arbitrary trailing bytes being swallowed as media.
      if (
        size < header ||
        size > end - start ||
        !/^[a-zA-Z0-9 ]{4}$/.test(type)
      )
        invalid();
      result.push({ type, start: start + header, end: start + size });
      start += size;
    }
    return result;
  };
  const one = (list: Box[], type: string) => {
    const found = list.filter((box) => box.type === type);
    if (found.length !== 1) invalid();
    return found[0];
  };
  const children = (box: Box) => boxes(box.start, box.end);
  const top = boxes(0, bytes.length);
  if (
    top[0]?.type !== 'ftyp' ||
    top.some(
      (box) =>
        !['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].includes(box.type),
    )
  )
    invalid();
  const ftyp = one(top, 'ftyp');
  if (ftyp.end - ftyp.start < 12 || (ftyp.end - ftyp.start) % 4) invalid();
  const brands = [
    'isom',
    'iso2',
    'iso4',
    'iso5',
    'iso6',
    'mp41',
    'mp42',
    'avc1',
    'av01',
  ];
  if (!brands.includes(bytes.toString('latin1', ftyp.start, ftyp.start + 4)))
    invalid();
  const media = top.filter((box) => box.type === 'mdat' && box.end > box.start);
  if (!media.length) invalid();
  const movie = children(one(top, 'moov'));
  const header = one(movie, 'mvhd');
  if (header.end - header.start < 100) invalid();
  let video = false;
  for (const track of movie.filter((box) => box.type === 'trak')) {
    const trackChildren = children(track);
    const tkhd = one(trackChildren, 'tkhd');
    if (tkhd.end - tkhd.start < 84) invalid();
    const mdia = children(one(trackChildren, 'mdia'));
    const handler = one(mdia, 'hdlr');
    if (handler.end - handler.start < 24) invalid();
    const kind = bytes.toString(
      'latin1',
      handler.start + 8,
      handler.start + 12,
    );
    if (!['vide', 'soun'].includes(kind)) invalid();
    const mdhd = one(mdia, 'mdhd');
    if (mdhd.end - mdhd.start < 24) invalid();
    const minf = children(one(mdia, 'minf'));
    const dref = one(children(one(minf, 'dinf')), 'dref');
    if (dref.end - dref.start < 8) invalid();
    const references = boxes(dref.start + 8, dref.end);
    if (
      !references.length ||
      references.length !== bytes.readUInt32BE(dref.start + 4)
    )
      invalid();
    // Embedded media only: never let a Blob preview follow external URL/URN data references.
    if (
      references.some(
        (ref) =>
          ref.type !== 'url ' ||
          ref.end - ref.start !== 4 ||
          bytes.readUInt32BE(ref.start) !== 1,
      )
    )
      invalid();
    const table = children(one(minf, 'stbl'));
    const desc = one(table, 'stsd');
    if (desc.end - desc.start < 8) invalid();
    const entries = boxes(desc.start + 8, desc.end);
    if (
      !entries.length ||
      entries.length !== bytes.readUInt32BE(desc.start + 4)
    )
      invalid();
    if (
      entries.some(
        (entry) =>
          entry.end - entry.start < 8 ||
          bytes.readUInt16BE(entry.start + 6) < 1 ||
          bytes.readUInt16BE(entry.start + 6) > references.length,
      )
    )
      invalid();
    if (
      kind === 'soun' &&
      entries.some((entry) => !['mp4a', 'Opus'].includes(entry.type))
    )
      invalid();
    if (kind === 'vide') {
      for (const entry of entries) {
        const config: Record<string, string> = {
          avc1: 'avcC',
          avc3: 'avcC',
          vp09: 'vpcC',
          av01: 'av1C',
        };
        if (
          !config[entry.type] ||
          entry.end - entry.start < 78 ||
          !bytes.readUInt16BE(entry.start + 24) ||
          !bytes.readUInt16BE(entry.start + 26)
        )
          invalid();
        const codec = one(
          boxes(entry.start + 78, entry.end),
          config[entry.type],
        );
        if (codec.end - codec.start < 4) invalid();
      }
      video = true;
    }
    const sizes = one(table, 'stsz');
    if (sizes.end - sizes.start < 12) invalid();
    const fixed = bytes.readUInt32BE(sizes.start + 4);
    const count = bytes.readUInt32BE(sizes.start + 8);
    if (
      !count ||
      count > 1000000 ||
      sizes.end - sizes.start !== 12 + (fixed ? 0 : count * 4)
    )
      invalid();
    let payload = fixed * count;
    if (!fixed)
      for (let i = 0; i < count; i++)
        payload += bytes.readUInt32BE(sizes.start + 12 + i * 4);
    if (
      !payload ||
      payload > media.reduce((sum, box) => sum + box.end - box.start, 0)
    )
      invalid();
    const offsets = table.filter(
      (box) => box.type === 'stco' || box.type === 'co64',
    );
    if (offsets.length !== 1) invalid();
    const offset = offsets[0],
      width = offset.type === 'co64' ? 8 : 4;
    if (offset.end - offset.start < 8) invalid();
    const chunks = bytes.readUInt32BE(offset.start + 4);
    if (!chunks || offset.end - offset.start !== 8 + chunks * width) invalid();
    for (let i = 0; i < chunks; i++) {
      const at = offset.start + 8 + i * width;
      const position =
        width === 8
          ? Number(bytes.readBigUInt64BE(at))
          : bytes.readUInt32BE(at);
      if (
        !Number.isSafeInteger(position) ||
        !media.some((box) => position >= box.start && position < box.end)
      )
        invalid();
    }
  }
  if (!video) invalid();
}

type Element = { id: number; start: number; end: number };
function webm(bytes: Buffer) {
  let budget = 50000;
  const vint = (at: number, end: number, id = false) => {
    if (at >= end || bytes[at] === 0) return invalid();
    let width = 1,
      mask = 0x80;
    while (!(bytes[at] & mask)) {
      width++;
      mask >>= 1;
    }
    if (width > (id ? 4 : 8) || at + width > end) return invalid();
    let value = BigInt(id ? bytes[at] : bytes[at] & (mask - 1));
    for (let i = 1; i < width; i++)
      value = value * 256n + BigInt(bytes[at + i]);
    return {
      width,
      value,
      unknown: !id && value === (1n << BigInt(7 * width)) - 1n,
    };
  };
  const elements = (start: number, end: number, root = false): Element[] => {
    const result: Element[] = [];
    while (start < end) {
      if (--budget < 0) invalid();
      const id = vint(start, end, true);
      start += id.width;
      const size = vint(start, end);
      start += size.width;
      if (size.unknown && !(root && id.value === 0x18538067n)) invalid();
      const length = size.unknown ? end - start : Number(size.value);
      if (!Number.isSafeInteger(length) || length > end - start) invalid();
      result.push({ id: Number(id.value), start, end: start + length });
      start += length;
    }
    return result;
  };
  const children = (el: Element) => elements(el.start, el.end);
  const one = (list: Element[], id: number) => {
    const found = list.filter((el) => el.id === id);
    if (found.length !== 1) invalid();
    return found[0];
  };
  const uint = (el: Element) => {
    if (el.end - el.start < 1 || el.end - el.start > 4) return invalid();
    return bytes.readUIntBE(el.start, el.end - el.start);
  };
  const text = (el: Element) => bytes.toString('utf8', el.start, el.end);
  const top = elements(0, bytes.length, true);
  if (top.length !== 2 || top[0].id !== 0x1a45dfa3 || top[1].id !== 0x18538067)
    invalid();
  if (text(one(children(top[0]), 0x4282)) !== 'webm') invalid();
  const segment = children(top[1]);
  if (
    segment.some(
      (el) =>
        ![
          0x114d9b74, 0x1549a966, 0x1654ae6b, 0x1f43b675, 0x1c53bb6b,
          0x1254c367, 0xec, 0xbf,
        ].includes(el.id),
    )
  )
    invalid();
  one(segment, 0x1549a966); // Segment information is mandatory.
  const videoTracks = new Set<number>();
  for (const entry of children(one(segment, 0x1654ae6b)).filter(
    (el) => el.id === 0xae,
  )) {
    const track = children(entry),
      type = uint(one(track, 0x83));
    if (type !== 1 && type !== 2) invalid();
    const number = uint(one(track, 0xd7));
    if (!number) invalid();
    const codec = text(one(track, 0x86));
    if (type === 1) {
      if (!['V_VP8', 'V_VP9', 'V_AV1'].includes(codec)) invalid();
      const dimensions = children(one(track, 0xe0));
      if (!uint(one(dimensions, 0xb0)) || !uint(one(dimensions, 0xba)))
        invalid();
      videoTracks.add(number);
    } else if (!['A_OPUS', 'A_VORBIS'].includes(codec)) invalid();
  }
  let videoBlock = false;
  for (const cluster of segment.filter((el) => el.id === 0x1f43b675)) {
    const contents = children(cluster);
    uint(one(contents, 0xe7));
    const blocks = contents.filter((el) => el.id === 0xa3);
    for (const group of contents.filter((el) => el.id === 0xa0))
      blocks.push(one(children(group), 0xa1));
    for (const block of blocks) {
      const track = vint(block.start, block.end);
      if (track.unknown || block.end - block.start <= track.width + 3)
        invalid();
      if (videoTracks.has(Number(track.value))) videoBlock = true;
    }
  }
  if (!videoTracks.size || !videoBlock) invalid();
}

export function validVideo(bytes: Buffer, extension: '.mp4' | '.webm') {
  try {
    if (extension === '.mp4') mp4(bytes);
    else webm(bytes);
    return true;
  } catch {
    return false;
  }
}
