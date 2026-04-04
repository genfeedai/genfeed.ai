import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ConfigModule } from '@api/config/config.module';
import { HookRemixController } from '@api/endpoints/v1/hook-remix/hook-remix.controller';
import { HookRemixService } from '@api/endpoints/v1/hook-remix/hook-remix.service';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [HookRemixController],
  exports: [HookRemixService],
  imports: [
    ConfigModule,
    HttpModule.register({
      maxRedirects: 5,
      timeout: 30000,
    }),
    IngredientsModule,
  ],
  providers: [HookRemixService],
})
export class HookRemixModule {}
