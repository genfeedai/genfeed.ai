/**
 * Api Keys Module
 * API key management: generate keys, revoke access, key scoping,
and usage monitoring.
 */
import { ApiKeysController } from '@api/collections/api-keys/controllers/api-keys.controller';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { McpConnectionVerificationService } from '@api/collections/api-keys/services/mcp-connection-verification.service';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ApiKeysController],
  exports: [ApiKeysService],
  imports: [CredentialsCoreModule],
  providers: [ApiKeysService, McpConnectionVerificationService],
})
export class ApiKeysModule {}
