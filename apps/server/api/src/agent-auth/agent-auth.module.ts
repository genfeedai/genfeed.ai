import { AgentAuthController } from '@api/agent-auth/controllers/agent-auth.controller';
import { AgentAuthService } from '@api/agent-auth/services/agent-auth.service';
import { BetterAuthModule } from '@api/auth/better-auth/better-auth.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AgentAuthController],
  imports: [ApiKeysModule, BetterAuthModule],
  providers: [AgentAuthService],
})
export class AgentAuthModule {}
