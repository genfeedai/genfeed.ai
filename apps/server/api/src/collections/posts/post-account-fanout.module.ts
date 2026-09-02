import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { PostAccountFanoutService } from '@api/collections/posts/services/post-account-fanout.service';
import { Module } from '@nestjs/common';

/**
 * Resolving "publish to TikTok" into one target per connected account.
 *
 * A leaf module on purpose: every automated publish path needs it (workflow
 * trend publish, workflow content, agent autopilot, batch generation), and
 * those live in different module trees. Hanging it off PostsModule would drag
 * the whole posts HTTP surface into each of them.
 */
@Module({
  exports: [PostAccountFanoutService],
  imports: [ContentIntelligenceModule, CredentialsCoreModule],
  providers: [PostAccountFanoutService],
})
export class PostAccountFanoutModule {}
