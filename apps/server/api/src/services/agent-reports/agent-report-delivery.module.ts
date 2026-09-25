import { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { AgentReportAccessService } from '@api/services/agent-reports/agent-report-access.service';
import { AgentReportDeliveryService } from '@api/services/agent-reports/agent-report-delivery.service';
import { CacheModule } from '@api/services/cache/cache.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
@Module({
  imports: [PrismaModule, CacheModule, ConfigModule, HttpModule],
  providers: [
    CredentialCryptoService,
    AgentReportAccessService,
    AgentReportDeliveryService,
  ],
  exports: [AgentReportAccessService, AgentReportDeliveryService],
})
export class AgentReportDeliveryModule {}
