import { MediaPerceptionModule } from '@api/services/media-perception/media-perception.module';
import { MediaTextDecisionService } from '@api/services/media-text-decisions/media-text-decision.service';
import { TypedDecisionsModule } from '@api/services/typed-decisions/typed-decisions.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/** Text decisions on perception output (#4882); workers-side writer. */
@Module({
  exports: [MediaTextDecisionService],
  imports: [
    ConfigModule,
    LoggerModule,
    MediaPerceptionModule,
    TypedDecisionsModule,
  ],
  providers: [MediaTextDecisionService],
})
export class MediaTextDecisionsModule {}
