vi.mock('@api/collections/activities/activities.module', () => ({
  ActivitiesModule: class ActivitiesModule {},
}));
vi.mock('@api/collections/credentials/credentials.module', () => ({
  CredentialsModule: class CredentialsModule {},
}));
vi.mock('@api/collections/organizations/organizations.module', () => ({
  OrganizationsModule: class OrganizationsModule {},
}));
vi.mock('@api/collections/posts/posts.module', () => ({
  PostsModule: class PostsModule {},
}));
vi.mock('@api/services/integrations/publishers/publishers.module', () => ({
  PublishersModule: class PublishersModule {},
}));
vi.mock('@api/services/quota/quota.module', () => ({
  QuotaModule: class QuotaModule {},
}));

import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';

describe('CronPostsModule', () => {
  it('should be defined', () => {
    expect(CronPostsModule).toBeDefined();
  });
});
