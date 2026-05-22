import { ClipProjectsController } from '@api/collections/clip-projects/clip-projects.controller';
import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ClipAnalyzeModule } from '@api/queues/clip-analyze/clip-analyze.module';
import { ClipFactoryModule } from '@api/queues/clip-factory/clip-factory.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ClipProjectsController],
  exports: [ClipProjectsCoreModule],
  imports: [
    forwardRef(() => ClipProjectsCoreModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ClipAnalyzeModule),
    forwardRef(() => ClipFactoryModule),
  ],
})
export class ClipProjectsModule {}
