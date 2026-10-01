import { ContentEvaluationProjectionService } from '@api/collections/evaluations/services/content-evaluation-projection.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule],
  providers: [ContentEvaluationProjectionService],
  exports: [ContentEvaluationProjectionService],
})
export class EvaluationReadModule {}
