import { VisualProjectsController } from '@api/collections/visual-projects/controllers/visual-projects.controller';
import { VisualProjectsCoreModule } from '@api/collections/visual-projects/visual-projects-core.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [VisualProjectsCoreModule],
  controllers: [VisualProjectsController],
})
export class VisualProjectsModule {}
