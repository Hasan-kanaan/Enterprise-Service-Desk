import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import mammoth from 'mammoth';
import * as yauzl from 'yauzl';
import { PDFParse } from 'pdf-parse';
import { CompanyKnowledgeStorage } from './company-knowledge.storage';
import { COMPANY_KNOWLEDGE_UPLOAD_LIMIT } from './company-knowledge-upload.interceptor';

const MAX_DOCX_ENTRIES = 10_000;
const MAX_DOCX_UNCOMPRESSED_SIZE = 250 * 1024 * 1024;
const PDF_CONTENT_TYPE = 'application/pdf';
const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEXT_CONTENT_TYPES = new Set(['text/plain', 'text/markdown']);

type PdfDiagnostics = { warnings: string[] };

const pdfDiagnosticsContext = new AsyncLocalStorage<PdfDiagnostics>();
const originalConsoleWarn = console.warn;
const capturePdfDiagnostics: typeof console.warn = (...args) => {
  const diagnostics = pdfDiagnosticsContext.getStore();
  if (
    diagnostics &&
    typeof args[0] === 'string' &&
    args[0].startsWith('Warning:') &&
    /pdf(?:\.worker)?\.mjs:\d+/.test(new Error().stack ?? '')
  )
    diagnostics.warnings.push(args[0]);
  originalConsoleWarn.apply(console, args);
};
console.warn = capturePdfDiagnostics;

async function withPdfDiagnostics<T>(extract: () => Promise<T>): Promise<T> {
  const diagnostics: PdfDiagnostics = { warnings: [] };
  const result = await pdfDiagnosticsContext.run(diagnostics, extract);
  if (diagnostics.warnings.length > 0)
    throw new CompanyKnowledgeExtractionError(
      'PDF parser reported warnings; extraction may be incomplete',
    );
  return result;
}

export class CompanyKnowledgeExtractionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CompanyKnowledgeExtractionError';
  }
}

@Injectable()
export class CompanyKnowledgeTextExtractionService {
  constructor(private readonly storage: CompanyKnowledgeStorage) {}

  async extract(storageKey: string, contentType: string): Promise<string> {
    if (
      contentType !== PDF_CONTENT_TYPE &&
      contentType !== DOCX_CONTENT_TYPE &&
      !TEXT_CONTENT_TYPES.has(contentType)
    )
      throw new CompanyKnowledgeExtractionError(
        'Unsupported company document content type',
      );

    const bytes = await this.readOriginal(storageKey);
    let text: string;
    try {
      if (contentType === PDF_CONTENT_TYPE) {
        try {
          text = await this.extractPdf(bytes);
        } catch (error) {
          if (error instanceof CompanyKnowledgeExtractionError) throw error;
          throw new CompanyKnowledgeExtractionError(
            'Company document is corrupted, encrypted, or unreadable',
          );
        }
      } else if (contentType === DOCX_CONTENT_TYPE)
        text = await this.extractDocx(bytes);
      else text = this.extractPlainText(bytes);
    } catch (error) {
      if (error instanceof CompanyKnowledgeExtractionError) throw error;
      throw new CompanyKnowledgeExtractionError(
        'Company document is corrupted, encrypted, or unreadable',
        { cause: error },
      );
    }

    if (!text.trim())
      throw new CompanyKnowledgeExtractionError(
        'Company document contains no usable text',
      );
    return text;
  }

  private async readOriginal(storageKey: string) {
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const value of this.storage.stream(
        storageKey,
      ) as AsyncIterable<Buffer>) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        size += chunk.length;
        if (size > COMPANY_KNOWLEDGE_UPLOAD_LIMIT)
          throw new CompanyKnowledgeExtractionError(
            'Stored company document exceeds the 50 MiB upload limit',
          );
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof CompanyKnowledgeExtractionError) throw error;
      throw new CompanyKnowledgeExtractionError(
        'Unable to read stored company document',
        { cause: error },
      );
    }
    return Buffer.concat(chunks, size);
  }

  private async extractPdf(bytes: Buffer) {
    return withPdfDiagnostics(async () => {
      const parser = new PDFParse({
        data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        stopAtErrors: true,
        isEvalSupported: false,
        useSystemFonts: true,
        verbosity: 1,
      });
      try {
        const result = await parser.getText();
        if (result.total < 1)
          throw new CompanyKnowledgeExtractionError('PDF contains no pages');
        return result.pages.map((page) => page.text).join('\n');
      } finally {
        await parser.destroy();
      }
    });
  }

  private extractPlainText(bytes: Buffer) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
      throw new CompanyKnowledgeExtractionError(
        'Text document is not valid UTF-8',
        { cause: error },
      );
    }
  }

  private async extractDocx(bytes: Buffer) {
    await this.validateDocxArchive(bytes);
    const result = await mammoth.extractRawText({ buffer: bytes });
    if (result.messages.length > 0)
      throw new CompanyKnowledgeExtractionError(
        'DOCX extraction was incomplete',
      );
    return result.value;
  }

  private async validateDocxArchive(bytes: Buffer) {
    const archive = await yauzl.fromBufferPromise(bytes, {
      lazyEntries: true,
      validateEntrySizes: true,
      strictFileNames: true,
    });
    let totalUncompressed = 0;
    let entryCount = 0;
    try {
      if (archive.entryCount > MAX_DOCX_ENTRIES)
        throw new CompanyKnowledgeExtractionError(
          'DOCX contains too many archive entries',
        );
      for await (const entry of archive.eachEntry()) {
        entryCount++;
        if (entryCount > MAX_DOCX_ENTRIES)
          throw new CompanyKnowledgeExtractionError(
            'DOCX contains too many archive entries',
          );
        if (entry.isEncrypted() || !entry.canDecodeFileData())
          throw new CompanyKnowledgeExtractionError(
            'Encrypted or unsupported DOCX archive entry',
          );
        totalUncompressed += entry.uncompressedSize;
        if (
          totalUncompressed > MAX_DOCX_UNCOMPRESSED_SIZE ||
          entry.uncompressedSize > MAX_DOCX_UNCOMPRESSED_SIZE
        )
          throw new CompanyKnowledgeExtractionError(
            'DOCX expanded archive exceeds the 250 MiB safety limit',
          );

        const stream = await archive.openReadStreamPromise(entry);
        let entrySize = 0;
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          entrySize += chunk.length;
          if (entrySize > entry.uncompressedSize)
            throw new CompanyKnowledgeExtractionError(
              'DOCX expanded archive exceeds the 250 MiB safety limit',
            );
        }
        if (entrySize !== entry.uncompressedSize)
          throw new CompanyKnowledgeExtractionError(
            'DOCX archive entry is truncated',
          );
      }
      if (entryCount === 0)
        throw new CompanyKnowledgeExtractionError('DOCX archive is empty');
    } finally {
      archive.close();
    }
  }
}
