import { AccountAnalyticsController } from '@api/endpoints/analytics/account-analytics.controller';
import { AnalyticsController } from '@api/endpoints/analytics/analytics.controller';
import { AnalyticsModule } from '@api/endpoints/analytics/analytics.module';
import { AnalyticsAdminController } from '@api/endpoints/analytics/analytics-admin.controller';
import { AnalyticsAdminSummaryService } from '@api/endpoints/analytics/analytics-admin-summary.service';
import { MODULE_METADATA } from '@nestjs/common/constants';

describe('AnalyticsModule', () => {
  it('should be defined', () => {
    expect(AnalyticsModule).toBeDefined();
  });

  it('registers the split controllers and admin summary service', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AnalyticsModule),
    ).toEqual([
      AccountAnalyticsController,
      AnalyticsAdminController,
      AnalyticsController,
    ]);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AnalyticsModule),
    ).toContain(AnalyticsAdminSummaryService);
  });
});
