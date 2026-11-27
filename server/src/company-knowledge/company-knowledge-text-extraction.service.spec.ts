import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { Readable } from 'node:stream';
import {
  CompanyKnowledgeExtractionError,
  CompanyKnowledgeTextExtractionService,
} from './company-knowledge-text-extraction.service';
import { CompanyKnowledgeStorage } from './company-knowledge.storage';

const PDF_TYPE = 'application/pdf';
const DOCX_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEXT_TYPE = 'text/plain';
const MARKDOWN_TYPE = 'text/markdown';

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFixture(
  entries: Array<{ name: string; contents: Buffer; encrypted?: boolean }>,
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const compressed = deflateRawSync(entry.contents);
    const checksum = crc32(entry.contents);
    const flags = 0x800 | (entry.encrypted ? 1 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function docxFixture(text: string, encrypted = false) {
  return zipFixture([
    {
      name: '[Content_Types].xml',
      contents: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      contents: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'word/document.xml',
      contents: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ),
      encrypted,
    },
  ]);
}

function oversizedDocxFixture() {
  const zip = docxFixture('bounded expansion');
  const centralEntryOffset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt32LE(250 * 1024 * 1024 + 1, centralEntryOffset + 24);
  return zip;
}

function corruptedDocxFixture() {
  const zip = docxFixture('corrupted document');
  const filenameLength = zip.readUInt16LE(26);
  zip[30 + filenameLength + 1] ^= 0xff;
  return zip;
}

function pdfFixture(text: string) {
  const escaped = text.replace(/([\\()])/g, '\\$1');
  const content = text
    ? `BT /F1 18 Tf 50 750 Td (${escaped}) Tj ET`
    : '0 0 m 100 100 l S';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function warningPdfFixture() {
  const pdf = pdfFixture('Text recovered after an xref warning').toString(
    'latin1',
  );
  return Buffer.from(pdf.replace(/startxref\n\d+/, 'startxref\n0'), 'latin1');
}

function rc4(key: Buffer, input: Buffer) {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + state[i] + key[i % key.length]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
  }
  const output = Buffer.alloc(input.length);
  let i = 0;
  j = 0;
  for (let offset = 0; offset < input.length; offset++) {
    i = (i + 1) & 0xff;
    j = (j + state[i]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
    output[offset] = input[offset] ^ state[(state[i] + state[j]) & 0xff];
  }
  return output;
}

function encryptedPdfFixture() {
  const padding = Buffer.from(
    '28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a',
    'hex',
  );
  const userPassword = Buffer.from('secret');
  const paddedUser = Buffer.concat([
    userPassword,
    padding.subarray(0, padding.length - userPassword.length),
  ]);
  const ownerPassword = Buffer.from('owner');
  const paddedOwner = Buffer.concat([
    ownerPassword,
    padding.subarray(0, padding.length - ownerPassword.length),
  ]);
  const ownerKey = createHash('md5')
    .update(paddedOwner)
    .digest()
    .subarray(0, 5);
  const ownerEntry = rc4(ownerKey, paddedUser);
  const id = Buffer.from('0123456789abcdef');
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-4);
  const fileKey = createHash('md5')
    .update(paddedUser)
    .update(ownerEntry)
    .update(permissions)
    .update(id)
    .digest()
    .subarray(0, 5);
  const userEntry = rc4(fileKey, padding);
  const objectKey = createHash('md5')
    .update(fileKey)
    .update(Buffer.from([4, 0, 0, 0, 0]))
    .digest()
    .subarray(0, 10);
  const plainContent = Buffer.from(
    'BT /F1 18 Tf 50 750 Td (private) Tj ET',
    'latin1',
  );
  const encryptedContent = rc4(objectKey, plainContent);
  const streamText = encryptedContent.toString('latin1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${encryptedContent.length} >>\nstream\n${streamText}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Filter /Standard /V 1 /R 2 /O <${ownerEntry.toString('hex')}> /U <${userEntry.toString('hex')}${'00'.repeat(16)}> /P -4 >>`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R /Encrypt 6 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function createExtractor(original: Buffer) {
  const stream = jest.fn(() => Readable.from([original]));
  const storage = { stream } as unknown as CompanyKnowledgeStorage;
  return {
    service: new CompanyKnowledgeTextExtractionService(storage),
    storage,
    stream,
  };
}

describe('CompanyKnowledgeTextExtractionService', () => {
  it.each([
    [PDF_TYPE, pdfFixture('Text from PDF'), 'Text from PDF'],
    [DOCX_TYPE, docxFixture('Text from DOCX'), 'Text from DOCX'],
    [TEXT_TYPE, Buffer.from('Text from TXT'), 'Text from TXT'],
    [
      MARKDOWN_TYPE,
      Buffer.from('# Heading\n\nText from Markdown'),
      '# Heading\n\nText from Markdown',
    ],
  ])(
    'extracts usable text from %s',
    async (contentType, original, expected) => {
      const { service, stream } = createExtractor(original);
      await expect(
        service.extract('original-key', contentType),
      ).resolves.toContain(expected);
      expect(stream).toHaveBeenCalledWith('original-key');
      expect(original).toEqual(expect.any(Buffer));
    },
  );

  it('rejects PDFs whose parser reports recovery warnings', async () => {
    const { service } = createExtractor(warningPdfFixture());

    await expect(
      service.extract('warning-pdf', PDF_TYPE),
    ).rejects.toMatchObject({
      name: 'CompanyKnowledgeExtractionError',
      message: 'PDF parser reported warnings; extraction may be incomplete',
    });
  });

  it('keeps warning diagnostics isolated across concurrent PDF extractions', async () => {
    const originalWarn = console.warn;
    const { service: warningService } = createExtractor(warningPdfFixture());
    const { service: validService } = createExtractor(
      pdfFixture('Concurrent valid PDF'),
    );

    const results = await Promise.allSettled([
      warningService.extract('warning-pdf', PDF_TYPE),
      validService.extract('valid-pdf', PDF_TYPE),
    ]);

    const warningResult = results[0];
    if (warningResult.status !== 'rejected')
      throw new Error('Expected warning PDF extraction to reject');
    const warningError: unknown = warningResult.reason;
    if (!(warningError instanceof CompanyKnowledgeExtractionError))
      throw new Error('Expected a safe CompanyKnowledge extraction error');
    expect(warningError.message).toBe(
      'PDF parser reported warnings; extraction may be incomplete',
    );

    const validResult = results[1];
    if (validResult.status !== 'fulfilled')
      throw new Error('Expected valid PDF extraction to succeed');
    expect(validResult.value).toContain('Concurrent valid PDF');
    expect(console.warn).toBe(originalWarn);
  });

  it('does not treat unrelated application warnings as PDF parser diagnostics', async () => {
    const originalWarn = console.warn;
    const { service } = createExtractor(
      pdfFixture('Valid despite app warning'),
    );
    const extraction = service.extract('valid-pdf', PDF_TYPE);

    console.warn('Warning: unrelated application warning');
    await expect(extraction).resolves.toContain('Valid despite app warning');
    expect(console.warn).toBe(originalWarn);
  });

  it('enforces the DOCX expanded-size safety limit before extraction', async () => {
    const { service } = createExtractor(oversizedDocxFixture());
    await expect(service.extract('oversized-docx', DOCX_TYPE)).rejects.toThrow(
      'DOCX expanded archive exceeds the 250 MiB safety limit',
    );
  });

  it('enforces the DOCX archive entry-count safety limit', async () => {
    const tooManyEntries = zipFixture(
      Array.from({ length: 10_001 }, (_, index) => ({
        name: `entry-${index}.xml`,
        contents: Buffer.alloc(0),
      })),
    );
    const { service } = createExtractor(tooManyEntries);
    await expect(
      service.extract('too-many-entries', DOCX_TYPE),
    ).rejects.toThrow('DOCX contains too many archive entries');
  });

  it.each([
    [PDF_TYPE, pdfFixture('')],
    [DOCX_TYPE, docxFixture('')],
    [TEXT_TYPE, Buffer.alloc(0)],
    [MARKDOWN_TYPE, Buffer.from(' \n\t ')],
  ])(
    'rejects empty or textless content of %s',
    async (contentType, original) => {
      const { service } = createExtractor(original);
      await expect(
        service.extract('empty-key', contentType),
      ).rejects.toBeInstanceOf(CompanyKnowledgeExtractionError);
    },
  );

  it.each([
    [PDF_TYPE, Buffer.from('%PDF-1.7\ntruncated')],
    [PDF_TYPE, encryptedPdfFixture()],
    [DOCX_TYPE, Buffer.from('not a zip archive')],
    [DOCX_TYPE, corruptedDocxFixture()],
    [
      DOCX_TYPE,
      docxFixture('truncated').subarray(
        0,
        docxFixture('truncated').length - 12,
      ),
    ],
    [DOCX_TYPE, docxFixture('secret', true)],
    [TEXT_TYPE, Buffer.from([0xff, 0xfe, 0x00])],
  ])(
    'rejects malformed, encrypted, or unreadable %s input',
    async (type, bytes) => {
      const { service } = createExtractor(bytes);
      await expect(service.extract('invalid-key', type)).rejects.toBeInstanceOf(
        CompanyKnowledgeExtractionError,
      );
    },
  );

  it('rejects unsupported content types and never mutates the stored original', async () => {
    const original = pdfFixture('Original bytes remain intact');
    const before = Buffer.from(original);
    const { service } = createExtractor(original);

    await expect(
      service.extract('original-key', 'application/octet-stream'),
    ).rejects.toThrow('Unsupported company document content type');
    await expect(service.extract('original-key', PDF_TYPE)).resolves.toContain(
      'Original bytes remain intact',
    );
    expect(original).toEqual(before);
  });

  it('rejects extraction failures without altering the source buffer', async () => {
    const original = Buffer.from('not a PDF');
    const before = Buffer.from(original);
    const { service } = createExtractor(original);

    const error = await service.extract('broken-key', PDF_TYPE).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({
      name: 'CompanyKnowledgeExtractionError',
      message: 'Company document is corrupted, encrypted, or unreadable',
    });
    expect(error).not.toHaveProperty('cause');
    expect(original).toEqual(before);
  });
});
