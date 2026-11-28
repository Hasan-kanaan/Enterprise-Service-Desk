import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../auth/auth.guard';
import { jwtConstants } from '../auth/auth.constants';
import { RolesGuard } from '../auth/roles.guard';
import { CompanyKnowledgeController } from './company-knowledge.controller';
import {
  CompanyKnowledgeStorage,
  createCompanyKnowledgeStorage,
} from './company-knowledge.storage';
import { CompanyKnowledgeService } from './company-knowledge.service';
import { CompanyKnowledgeTextExtractionService } from './company-knowledge-text-extraction.service';
import { CompanyKnowledgeProcessingWorker } from './company-knowledge-processing.worker';
import { CompanyKnowledgeStatusGateway } from './company-knowledge-status.gateway';

@Module({
  imports: [JwtModule.register({ secret: jwtConstants.secret })],
  controllers: [CompanyKnowledgeController],
  providers: [
    AuthGuard,
    RolesGuard,
    CompanyKnowledgeService,
    CompanyKnowledgeTextExtractionService,
    CompanyKnowledgeProcessingWorker,
    CompanyKnowledgeStatusGateway,
    {
      provide: CompanyKnowledgeStorage,
      useFactory: () => createCompanyKnowledgeStorage(),
    },
  ],
})
export class CompanyKnowledgeModule {}
