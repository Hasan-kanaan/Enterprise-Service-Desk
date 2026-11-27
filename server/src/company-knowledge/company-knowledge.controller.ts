import {
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { ListQuery } from '../common/list-query';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
  CompanyKnowledgeFileInterceptor,
  CompanyKnowledgeUploadInterceptor,
} from './company-knowledge-upload.interceptor';
import type { CompanyKnowledgeUpload } from './company-knowledge-upload.interceptor';
import {
  CompanyKnowledgeStorage,
  isMissingCompanyKnowledgeObject,
} from './company-knowledge.storage';
import { CompanyKnowledgeService } from './company-knowledge.service';

@Controller('company-knowledge')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class CompanyKnowledgeController {
  private readonly logger = new Logger(CompanyKnowledgeController.name);

  constructor(
    private readonly service: CompanyKnowledgeService,
    private readonly storage: CompanyKnowledgeStorage,
  ) {}

  @Get('documents')
  list(@Query() query: ListQuery = {}) {
    return this.service.list(query);
  }

  @Post('documents')
  @UseInterceptors(
    CompanyKnowledgeFileInterceptor,
    CompanyKnowledgeUploadInterceptor,
  )
  upload(
    @UploadedFile() file: CompanyKnowledgeUpload,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.uploadNew(file, { id: request.user!.sub });
  }

  @Post('documents/:documentId/versions')
  @UseInterceptors(
    CompanyKnowledgeFileInterceptor,
    CompanyKnowledgeUploadInterceptor,
  )
  uploadVersion(
    @Param('documentId', ParseIntPipe) documentId: number,
    @UploadedFile() file: CompanyKnowledgeUpload,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.uploadVersion(documentId, file, {
      id: request.user!.sub,
    });
  }

  @Get('documents/:documentId')
  details(@Param('documentId', ParseIntPipe) documentId: number) {
    return this.service.details(documentId);
  }

  @Get('versions/:versionId/download')
  async download(
    @Param('versionId', ParseIntPipe) versionId: number,
    @Res({ passthrough: true }) response: Response,
  ) {
    const metadata = await this.service.downloadMetadata(versionId);
    const stream = this.storage.stream(metadata.storageKey);
    const file = new StreamableFile(stream, {
      type: metadata.contentType,
      disposition: `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(metadata.originalName).replace(/['()*]/g, (character) => '%' + character.charCodeAt(0).toString(16))}`,
      length: metadata.byteSize,
    });
    file.setErrorHandler((error, streamResponse) => {
      if (streamResponse.headersSent) {
        streamResponse.end();
        return;
      }
      const missing = isMissingCompanyKnowledgeObject(error);
      streamResponse.statusCode = missing ? 404 : 503;
      streamResponse.send(
        JSON.stringify({
          statusCode: missing ? 404 : 503,
          message: missing
            ? 'Company document unavailable'
            : 'Company document storage download failed',
        }),
      );
    });
    file.setErrorLogger((error) => {
      const missing = isMissingCompanyKnowledgeObject(error);
      this.logger.error(
        `Company document stream failed: status=${missing ? 404 : 503}`,
      );
    });
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Security-Policy',
      "sandbox; default-src 'none'",
    );
    return file;
  }
}
