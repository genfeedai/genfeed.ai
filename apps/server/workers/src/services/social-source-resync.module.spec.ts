import { SocialSourceOwnAccountResyncWorkflowService } from '@api/collections/social-sources/services/social-source-own-account-resync-workflow.service';
import { SocialSourcesModule } from '@api/collections/social-sources/social-sources.module';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { CronSocialSourceResyncModule } from '@workers/crons/social-sources/cron.social-source-resync.module';

describe('CronSocialSourceResyncModule', () => {
  it('can obtain the resync workflow dependency from its imported module', () => {
    const imports: unknown[] =
      Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        CronSocialSourceResyncModule,
      ) ?? [];
    const exports: unknown[] =
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, SocialSourcesModule) ?? [];
    expect(imports).toContain(SocialSourcesModule);
    expect(exports).toContain(SocialSourceOwnAccountResyncWorkflowService);
  });
});
