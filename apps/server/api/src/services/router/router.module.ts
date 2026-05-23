import { ModelsModule } from '@api/collections/models/models.module';
import { RouterController } from '@api/services/router/router.controller';
import { RouterService } from '@api/services/router/router.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [RouterController],
  exports: [RouterService],
  imports: [LoggerModule, forwardRef(() => ModelsModule)],
  providers: [RouterService],
})
export class RouterModule {}
