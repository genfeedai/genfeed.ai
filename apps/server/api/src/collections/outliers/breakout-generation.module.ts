import { BrandAccessModule } from '@api/authorization/brand-access/brand-access.module';
import { AgentStrategiesCoreModule } from '@api/collections/agent-strategies/agent-strategies-core.module';
import { ContentLearningCoreModule } from '@api/collections/content-learning/content-learning-core.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EvaluationsModule } from '@api/collections/evaluations/evaluations.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OptimizersModule } from '@api/collections/optimizers/optimizers.module';
import { BreakoutGenerationPlanService } from '@api/collections/outliers/services/breakout-generation-plan.service';
import { BreakoutMediaOutputGenerationService } from '@api/collections/outliers/services/breakout-media-output-generation.service';
import { BreakoutMediaOutputPreparationService } from '@api/collections/outliers/services/breakout-media-output-preparation.service';
import { BreakoutOutputQualityService } from '@api/collections/outliers/services/breakout-output-quality.service';
import { BreakoutResponseExecutionService } from '@api/collections/outliers/services/breakout-response-execution.service';
import { BreakoutResponseExecutionWorkflowService } from '@api/collections/outliers/services/breakout-response-execution-workflow.service';
import { BreakoutReviewHandoffService } from '@api/collections/outliers/services/breakout-review-handoff.service';
import { BreakoutTextOutputGenerationService } from '@api/collections/outliers/services/breakout-text-output-generation.service';
import { BreakoutTextOutputPreparationService } from '@api/collections/outliers/services/breakout-text-output-preparation.service';
import { BreakoutVisualBrandReceiptService } from '@api/collections/outliers/services/breakout-visual-brand-receipt.service';
import { BreakoutVisualQualityService } from '@api/collections/outliers/services/breakout-visual-quality.service';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { AgentGenerationGatewayModule } from '@api/services/agent-generation-gateway/agent-generation-gateway.module';
import { BrandValidationModule } from '@api/services/brand-validation/brand-validation.module';
import { BrandValidationReceiptModule } from '@api/services/brand-validation/brand-validation-receipt.module';
import { BrandedGenerationReceiptsModule } from '@api/services/branded-generation-receipts/branded-generation-receipts.module';
import { BrandedTextGenerationModule } from '@api/services/branded-text-generation/branded-text-generation.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { RouterModule } from '@api/services/router/router.module';
import { TurboRunModule } from '@api/services/turbo-run/turbo-run.module';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

/** Concrete generation consumers; analytics evidence and read services remain independent of this graph. */
@Module({
  imports: [
    BrandAccessModule,
    WorkflowsCoreModule,
    AgentStrategiesCoreModule,
    ContentLearningCoreModule,
    CredentialsCoreModule,
    ModelsModule,
    EvaluationsModule,
    PlatformSettingsModule,
    RouterModule,
    OptimizersModule,
    CreditsModule,
    PostsCoreModule,
    AgentGenerationGatewayModule,
    BrandValidationModule,
    BrandValidationReceiptModule,
    BrandedGenerationReceiptsModule,
    BrandedTextGenerationModule,
    ByokModule,
    PrismaModule,
    TurboRunModule,
  ],
  providers: [
    BreakoutResponseExecutionService,
    BreakoutResponseExecutionWorkflowService,
    BreakoutTextOutputPreparationService,
    BreakoutGenerationPlanService,
    BreakoutOutputQualityService,
    BreakoutMediaOutputGenerationService,
    BreakoutMediaOutputPreparationService,
    BreakoutReviewHandoffService,
    BreakoutTextOutputGenerationService,
    BreakoutVisualBrandReceiptService,
    BreakoutVisualQualityService,
  ],
  exports: [
    BreakoutResponseExecutionService,
    BreakoutTextOutputPreparationService,
    BreakoutGenerationPlanService,
    BreakoutOutputQualityService,
    BreakoutMediaOutputGenerationService,
    BreakoutMediaOutputPreparationService,
    BreakoutTextOutputGenerationService,
    BreakoutVisualQualityService,
  ],
})
export class BreakoutGenerationModule {}
