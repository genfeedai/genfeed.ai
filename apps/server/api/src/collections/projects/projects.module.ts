import { ProjectsController } from '@api/collections/projects/controllers/projects.controller';
import { ProjectsService } from '@api/collections/projects/services/projects.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ProjectsController],
  exports: [ProjectsService],
  imports: [LoggerModule],
  providers: [ProjectsService],
})
export class ProjectsModule {}
