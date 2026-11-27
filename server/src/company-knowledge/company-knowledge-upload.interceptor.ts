import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { open, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { createReadStream } from 'node:fs';
import { crc32, createInflateRaw } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform, Writable } from 'node:stream';
import {
  catchError,
  concatMap,
  finalize,
  from,
  map,
  mergeMap,
  throwError,
} from 'rxjs';
import type { Observable } from 'rxjs';

export const COMPANY_KNOWLEDGE_UPLOAD_LIMIT = 50 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 10_000;
const MAX_DOCX_UNCOMPRESSED_SIZE = 250 * 1024 * 1024;
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type CompanyKnowledgeUpload = {
  path: string;
  stagingDirectory: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
};

type StagedMultipartFile = {
  originalname: string;
  mimetype: string;
  path?: string;
  stagingDirectory?: string;
  size?: number;
  sha256?: string;
  stream: Readable & { truncated?: boolean };
};

const expectedTypes: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': DOCX_MIME,
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
};

function safeFilename(originalName: string) {
  const filename = originalName
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    // eslint-disable-next-line no-control-regex -- Remove control bytes from untrusted filenames.
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_')
    .replace(/^\.+|[. ]+$/g, '')
    .slice(-200);
  if (!filename) throw new BadRequestException('Invalid filename');
  return filename;
}

function contentTypeFor(filename: string, mimetype: string) {
  const extension = extname(filename).toLowerCase();
  const contentType = expectedTypes[extension];
  if (!contentType)
    throw new BadRequestException('Unsupported company document type');
  const allowedMimeTypes =
    extension === '.md' || extension === '.markdown'
      ? [contentType, 'text/plain', 'application/octet-stream']
      : [contentType, 'application/octet-stream'];
  if (!allowedMimeTypes.includes(mimetype))
    throw new BadRequestException('File type does not match its extension');
  return contentType;
}

async function readAt(
  handle: Awaited<ReturnType<typeof open>>,
  offset: number,
  length: number,
) {
  const buffer = Buffer.alloc(length);
  let total = 0;
  while (total < length) {
    const result = await handle.read(
      buffer,
      total,
      length - total,
      offset + total,
    );
    if (result.bytesRead === 0) break;
    total += result.bytesRead;
  }
  return buffer.subarray(0, total);
}

async function validPdf(path: string, byteSize: number) {
  if (byteSize < 32) return false;
  const handle = await open(path, 'r');
  try {
    const header = await readAt(handle, 0, 8);
    if (!/^%PDF-[1-2]\.\d/.test(header.toString('latin1'))) return false;
    const tailLength = Math.min(2048, byteSize);
    const tailStart = byteSize - tailLength;
    const tail = await readAt(handle, tailStart, tailLength);
    const match = /startxref\s+(\d+)\s+%%EOF(?:\s|$)/.exec(
      tail.toString('latin1'),
    );
    if (!match) return false;

    const offset = Number(match[1]);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= byteSize)
      return false;
    const xref = await readAt(handle, offset, Math.min(512, byteSize - offset));
    const text = xref.toString('latin1');
    return (
      /^\s*xref(?:\s|$)/.test(text) ||
      /^\s*\d+\s+\d+\s+obj\b[\s\S]{0,256}?\/Type\s*\/XRef\b/.test(text)
    );
  } finally {
    await handle.close();
  }
}

async function validText(path: string) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    for await (const chunk of createReadStream(path) as AsyncIterable<Buffer>) {
      const text = decoder.decode(chunk, { stream: true });
      // eslint-disable-next-line no-control-regex -- Reject binary control bytes in text documents.
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) return false;
    }
    const tail = decoder.decode();
    // eslint-disable-next-line no-control-regex -- Reject binary control bytes in text documents.
    return !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(tail);
  } catch {
    return false;
  }
}

type ZipEntryValidation = {
  valid: boolean;
  contentTypesRoot?: boolean;
  hasDocxMainType?: boolean;
  documentRoot?: boolean;
};

async function validateZipEntry(
  path: string,
  name: string,
  dataStart: number,
  compressedSize: number,
  method: number,
  uncompressedSize: number,
  expectedCrc: number,
  totalUncompressed: { value: number },
): Promise<ZipEntryValidation> {
  const source =
    compressedSize === 0
      ? Readable.from([])
      : createReadStream(path, {
          start: dataStart,
          end: dataStart + compressedSize - 1,
        });
  const isContentTypes = name === '[Content_Types].xml';
  const isDocumentXml = name === 'word/document.xml';
  const decoder =
    isContentTypes || isDocumentXml
      ? new TextDecoder('utf-8', { fatal: true })
      : undefined;
  let scanned = '';
  let contentTypesRoot = false;
  let hasDocxMainType = false;
  let documentRoot = false;
  let entrySize = 0;
  let checksum = 0;

  const inspectXml = (text: string) => {
    const combined = scanned + text;
    if (isContentTypes) {
      contentTypesRoot ||= /<Types\b/.test(combined);
      hasDocxMainType ||= /wordprocessingml\.document\.main\+xml/.test(
        combined,
      );
    }
    if (isDocumentXml)
      documentRoot ||= /<(?:[A-Za-z_][\w.-]*:)?document\b/.test(combined);
    scanned = combined.slice(-128);
  };

  const verifier = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      try {
        entrySize += chunk.length;
        totalUncompressed.value += chunk.length;
        if (
          entrySize > uncompressedSize ||
          totalUncompressed.value > MAX_DOCX_UNCOMPRESSED_SIZE
        )
          throw new Error('DOCX expanded size limit exceeded');
        checksum = crc32(chunk, checksum);
        if (decoder) inspectXml(decoder.decode(chunk, { stream: true }));
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error('Invalid DOCX'));
      }
    },
    final(callback) {
      try {
        if (decoder) inspectXml(decoder.decode());
        if (entrySize !== uncompressedSize || checksum !== expectedCrc)
          throw new Error('DOCX entry integrity check failed');
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new Error('Invalid DOCX'));
      }
    },
  });

  try {
    if (method === 8) await pipeline(source, createInflateRaw(), verifier);
    else await pipeline(source, verifier);
    return {
      valid: true,
      contentTypesRoot,
      hasDocxMainType,
      documentRoot,
    };
  } catch {
    return { valid: false };
  }
}

async function validDocx(path: string, byteSize: number) {
  const handle = await open(path, 'r');
  try {
    const tailLength = Math.min(65_557, byteSize);
    const tailStart = byteSize - tailLength;
    const tail = await readAt(handle, tailStart, tailLength);
    let eocdOffset = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = tailStart + i;
        break;
      }
    }
    if (eocdOffset < 0) return false;
    const eocd = await readAt(handle, eocdOffset, 22);
    if (eocd.length !== 22 || eocd.readUInt32LE(0) !== 0x06054b50) return false;

    const diskNumber = eocd.readUInt16LE(4);
    const centralDisk = eocd.readUInt16LE(6);
    const diskEntries = eocd.readUInt16LE(8);
    const entryCount = eocd.readUInt16LE(10);
    const centralSize = eocd.readUInt32LE(12);
    const centralOffset = eocd.readUInt32LE(16);
    const commentLength = eocd.readUInt16LE(20);
    if (
      diskNumber !== 0 ||
      centralDisk !== 0 ||
      diskEntries !== entryCount ||
      entryCount < 1 ||
      entryCount > MAX_DOCX_ENTRIES ||
      entryCount === 0xffff ||
      centralSize === 0xffffffff ||
      centralOffset === 0xffffffff ||
      eocdOffset + 22 + commentLength !== byteSize ||
      centralOffset + centralSize !== eocdOffset
    )
      return false;

    let cursor = centralOffset;
    let totalExpected = 0;
    const totalUncompressed = { value: 0 };
    let foundContentTypes = false;
    let foundDocumentXml = false;
    let contentTypesValid = false;
    let mainTypeValid = false;
    let documentXmlValid = false;

    for (let index = 0; index < entryCount; index++) {
      const central = await readAt(handle, cursor, 46);
      if (central.length !== 46 || central.readUInt32LE(0) !== 0x02014b50)
        return false;
      const flags = central.readUInt16LE(8);
      const method = central.readUInt16LE(10);
      const expectedCrc = central.readUInt32LE(16);
      const compressedSize = central.readUInt32LE(20);
      const uncompressedSize = central.readUInt32LE(24);
      const filenameLength = central.readUInt16LE(28);
      const extraLength = central.readUInt16LE(30);
      const entryCommentLength = central.readUInt16LE(32);
      const localOffset = central.readUInt32LE(42);
      const variableLength = filenameLength + extraLength + entryCommentLength;
      const centralEnd = cursor + 46 + variableLength;
      if (
        centralEnd > eocdOffset ||
        filenameLength === 0 ||
        compressedSize === 0xffffffff ||
        uncompressedSize === 0xffffffff ||
        localOffset === 0xffffffff ||
        (flags & 1) !== 0 ||
        (method !== 0 && method !== 8)
      )
        return false;

      const nameBytes = await readAt(handle, cursor + 46, filenameLength);
      if (nameBytes.length !== filenameLength) return false;
      const name =
        (flags & 0x800) !== 0
          ? new TextDecoder('utf-8', { fatal: true }).decode(nameBytes)
          : nameBytes.toString('latin1');
      const local = await readAt(handle, localOffset, 30);
      if (
        local.length !== 30 ||
        local.readUInt32LE(0) !== 0x04034b50 ||
        local.readUInt16LE(6) !== flags ||
        local.readUInt16LE(8) !== method
      )
        return false;
      const localNameLength = local.readUInt16LE(26);
      const localExtraLength = local.readUInt16LE(28);
      if (localNameLength !== filenameLength) return false;
      const localName = await readAt(handle, localOffset + 30, localNameLength);
      if (!localName.equals(nameBytes)) return false;
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if (dataStart + compressedSize > centralOffset) return false;

      totalExpected += uncompressedSize;
      if (totalExpected > MAX_DOCX_UNCOMPRESSED_SIZE) return false;
      const entry = await validateZipEntry(
        path,
        name,
        dataStart,
        compressedSize,
        method,
        uncompressedSize,
        expectedCrc,
        totalUncompressed,
      );
      if (!entry.valid) return false;
      if (name === '[Content_Types].xml') {
        foundContentTypes = true;
        contentTypesValid = entry.contentTypesRoot ?? false;
        mainTypeValid = entry.hasDocxMainType ?? false;
      }
      if (name === 'word/document.xml') {
        foundDocumentXml = true;
        documentXmlValid = entry.documentRoot ?? false;
      }
      cursor = centralEnd;
    }

    return (
      cursor === eocdOffset &&
      foundContentTypes &&
      foundDocumentXml &&
      contentTypesValid &&
      mainTypeValid &&
      documentXmlValid
    );
  } catch {
    return false;
  } finally {
    await handle.close();
  }
}

export async function validateCompanyKnowledgeUpload(
  file: StagedMultipartFile,
): Promise<CompanyKnowledgeUpload> {
  if (
    !file.path ||
    !file.stagingDirectory ||
    !Number.isSafeInteger(file.size) ||
    file.size! > COMPANY_KNOWLEDGE_UPLOAD_LIMIT ||
    !file.sha256
  )
    throw new PayloadTooLargeException(
      'Maximum company document size is 50 MiB',
    );

  const originalName = safeFilename(file.originalname);
  const contentType = contentTypeFor(originalName, file.mimetype);
  const valid =
    extname(originalName).toLowerCase() === '.pdf'
      ? await validPdf(file.path, file.size!)
      : extname(originalName).toLowerCase() === '.docx'
        ? await validDocx(file.path, file.size!)
        : await validText(file.path);
  if (!valid)
    throw new BadRequestException(
      'File content does not match an allowed format',
    );

  return {
    path: file.path,
    stagingDirectory: file.stagingDirectory,
    originalName,
    contentType,
    byteSize: file.size!,
    sha256: file.sha256,
  };
}

export async function removeCompanyKnowledgeStagedFile(
  file: { stagingDirectory?: string } | undefined,
) {
  if (file?.stagingDirectory)
    await rm(file.stagingDirectory, { recursive: true, force: true });
}

export const boundedCompanyKnowledgeFileStorage = {
  _handleFile(
    _req: object,
    file: StagedMultipartFile,
    callback: (
      error: Error | null,
      info?: {
        path: string;
        stagingDirectory: string;
        size: number;
        sha256: string;
      },
    ) => void,
  ) {
    let callbackCalled = false;
    let stagingDirectory: string | undefined;
    const finish = (
      error: Error | null,
      info?: {
        path: string;
        stagingDirectory: string;
        size: number;
        sha256: string;
      },
    ) => {
      if (callbackCalled) return;
      callbackCalled = true;
      callback(error, info);
    };

    void (async () => {
      stagingDirectory = await mkdtemp(
        join(tmpdir(), 'eds-company-knowledge-upload-'),
      );
      const path = join(stagingDirectory, randomUUID());
      const digest = createHash('sha256');
      let size = 0;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.length;
          if (size > COMPANY_KNOWLEDGE_UPLOAD_LIMIT) {
            done(
              new PayloadTooLargeException(
                'Maximum company document size is 50 MiB',
              ),
            );
            return;
          }
          digest.update(chunk);
          done(null, chunk);
        },
      });

      await pipeline(
        file.stream,
        meter,
        createWriteStream(path, { flags: 'wx', mode: 0o600 }),
      );
      if (file.stream.truncated)
        throw new PayloadTooLargeException(
          'Maximum company document size is 50 MiB',
        );
      finish(null, {
        path,
        stagingDirectory,
        size,
        sha256: digest.digest('hex'),
      });
    })().catch(async (error: unknown) => {
      if (stagingDirectory) {
        try {
          await rm(stagingDirectory, { recursive: true, force: true });
        } catch (cleanupError) {
          new Logger('CompanyKnowledgeUpload').error(
            'Temporary upload cleanup failed',
            cleanupError,
          );
        }
      }
      finish(
        error instanceof Error
          ? error
          : new Error('Company document upload failed'),
      );
    });
  },
  _removeFile(
    _req: object,
    file: { stagingDirectory?: string },
    callback: (error: Error | null) => void,
  ) {
    void removeCompanyKnowledgeStagedFile(file).then(
      () => callback(null),
      (error: unknown) =>
        callback(
          error instanceof Error
            ? error
            : new Error('Temporary upload cleanup failed'),
        ),
    );
  },
};

const MulterCompanyKnowledgeInterceptor = FileInterceptor('file', {
  storage: boundedCompanyKnowledgeFileStorage,
  limits: {
    // Busboy flags a file at the limit; the streaming meter rejects the extra byte.
    fileSize: COMPANY_KNOWLEDGE_UPLOAD_LIMIT + 1,
    files: 1,
    fields: 0,
    parts: 1,
  },
});

function isMulterFileSizeError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'LIMIT_FILE_SIZE'
  );
}

@Injectable()
export class CompanyKnowledgeFileInterceptor implements NestInterceptor {
  private readonly delegate = new MulterCompanyKnowledgeInterceptor();

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    return from(Promise.resolve(this.delegate.intercept(context, next))).pipe(
      mergeMap((result): Observable<unknown> => result),
      catchError((error: unknown) =>
        throwError(() =>
          isMulterFileSizeError(error)
            ? new PayloadTooLargeException(
                'Maximum company document size is 50 MiB',
              )
            : error,
        ),
      ),
    );
  }
}

@Injectable()
export class CompanyKnowledgeUploadInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CompanyKnowledgeUploadInterceptor.name);

  private async cleanup(file: { stagingDirectory?: string }) {
    try {
      await removeCompanyKnowledgeStagedFile(file);
    } catch (error) {
      this.logger.error('Temporary upload cleanup failed', error);
    }
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{
      file?: StagedMultipartFile;
    }>();
    if (!request.file)
      throw new BadRequestException('A company document file is required');

    let upload: CompanyKnowledgeUpload;
    try {
      upload = await validateCompanyKnowledgeUpload(request.file);
      Object.assign(request.file, upload);
    } catch (error) {
      await this.cleanup(request.file);
      throw error;
    }

    return next.handle().pipe(
      concatMap((result) => from(this.cleanup(upload)).pipe(map(() => result))),
      catchError((error: unknown) =>
        from(this.cleanup(upload)).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
      finalize(() => {
        void this.cleanup(upload);
      }),
    );
  }
}
