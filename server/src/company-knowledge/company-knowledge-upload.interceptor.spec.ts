import { createHash } from 'node:crypto';
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, lastValueFrom, NEVER, of, throwError } from 'rxjs';
import {
  boundedCompanyKnowledgeFileStorage,
  COMPANY_KNOWLEDGE_UPLOAD_LIMIT,
  CompanyKnowledgeUploadInterceptor,
  removeCompanyKnowledgeStagedFile,
} from './company-knowledge-upload.interceptor';

const stagingPrefix = 'eds-company-knowledge-upload-';

async function stagingDirectories() {
  return (await readdir(tmpdir())).filter((entry) =>
    entry.startsWith(stagingPrefix),
  );
}

async function createInterceptorRequest() {
  const stagingDirectory = await mkdtemp(
    join(tmpdir(), 'eds-company-knowledge-interceptor-'),
  );
  const path = join(stagingDirectory, 'upload');
  const bytes = Buffer.from('valid text content');
  await writeFile(path, bytes);
  const request = {
    file: {
      originalname: 'notes.txt',
      mimetype: 'text/plain',
      path,
      stagingDirectory,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, stagingDirectory };
}

async function expectStagingRemoved(path: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await access(path);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch {
      return;
    }
  }
  throw new Error('Expected temporary upload staging to be removed');
}

describe('CompanyKnowledge upload staging', () => {
  it('streams to a private staged file and hashes the unchanged bytes', async () => {
    const bytes = Buffer.from('original document bytes');
    const before = await stagingDirectories();
    const staged = await new Promise<{
      path: string;
      stagingDirectory: string;
      size: number;
      sha256: string;
    }>((resolve, reject) => {
      boundedCompanyKnowledgeFileStorage._handleFile(
        {},
        {
          originalname: 'notes.txt',
          mimetype: 'text/plain',
          stream: Readable.from([bytes]),
        },
        (error, info) => {
          if (error) reject(error);
          else if (info) resolve(info);
          else reject(new Error('Upload staging returned no file metadata'));
        },
      );
    });

    expect(await readFile(staged.path)).toEqual(bytes);
    expect(staged.size).toBe(bytes.length);
    expect(staged.sha256).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect((await stagingDirectories()).length).toBe(before.length + 1);
    await removeCompanyKnowledgeStagedFile(staged);
    await expect(access(staged.stagingDirectory)).rejects.toThrow();
    expect(await stagingDirectories()).toEqual(before);
  });

  it('removes temporary staging when the streaming size limit is exceeded', async () => {
    const before = await stagingDirectories();
    function* oversizedChunks() {
      for (
        let index = 0;
        index < COMPANY_KNOWLEDGE_UPLOAD_LIMIT / 1024 / 1024;
        index++
      )
        yield Buffer.alloc(1024 * 1024, 0x61);
      yield Buffer.from('x');
    }

    await expect(
      new Promise((resolve, reject) => {
        boundedCompanyKnowledgeFileStorage._handleFile(
          {},
          {
            originalname: 'oversized.txt',
            mimetype: 'text/plain',
            stream: Readable.from(oversizedChunks()),
          },
          (error, info) => {
            if (error) reject(error);
            else resolve(info);
          },
        );
      }),
    ).rejects.toThrow('Maximum company document size is 50 MiB');
    expect(await stagingDirectories()).toEqual(before);
  });

  it('removes staged files when the response observable is cancelled', async () => {
    const { context, stagingDirectory } = await createInterceptorRequest();
    const interceptor = new CompanyKnowledgeUploadInterceptor();
    const next: CallHandler<unknown> = { handle: () => NEVER };

    const response = await interceptor.intercept(context, next);
    const subscription = response.subscribe();
    subscription.unsubscribe();

    await expectStagingRemoved(stagingDirectory);
  });

  it('awaits staged-file cleanup on success and downstream errors', async () => {
    const successful = await createInterceptorRequest();
    const interceptor = new CompanyKnowledgeUploadInterceptor();
    const successNext: CallHandler<unknown> = { handle: () => of('done') };
    const successResponse = await interceptor.intercept(
      successful.context,
      successNext,
    );
    await expect(firstValueFrom(successResponse)).resolves.toBe('done');
    await expectStagingRemoved(successful.stagingDirectory);

    const failed = await createInterceptorRequest();
    const requestError = new Error('downstream failure');
    const errorNext: CallHandler<unknown> = {
      handle: () => throwError(() => requestError),
    };
    const errorResponse = await interceptor.intercept(
      failed.context,
      errorNext,
    );
    await expect(lastValueFrom(errorResponse)).rejects.toBe(requestError);
    await expectStagingRemoved(failed.stagingDirectory);

    await Promise.all([
      rm(successful.stagingDirectory, { recursive: true, force: true }),
      rm(failed.stagingDirectory, { recursive: true, force: true }),
    ]);
  });
});
