import { ElementsBlacklistsModule } from '@api/collections/elements/blacklists/blacklists.module';
import { ElementsCameraMovementsModule } from '@api/collections/elements/camera-movements/camera-movements.module';
import { ElementsCamerasModule } from '@api/collections/elements/cameras/cameras.module';
import { ElementsController } from '@api/collections/elements/elements.controller';
import { ElementsService } from '@api/collections/elements/elements.service';
import { ElementsLensesModule } from '@api/collections/elements/lenses/lenses.module';
import { ElementsLightingsModule } from '@api/collections/elements/lightings/lightings.module';
import { ElementsMoodsModule } from '@api/collections/elements/moods/moods.module';
import { ElementsScenesModule } from '@api/collections/elements/scenes/scenes.module';
import { ElementsSoundsModule } from '@api/collections/elements/sounds/sounds.module';
import { ElementsStylesModule } from '@api/collections/elements/styles/styles.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsController],
  exports: [ElementsService],
  imports: [
    ElementsBlacklistsModule,
    ElementsCameraMovementsModule,
    ElementsCamerasModule,
    ElementsLensesModule,
    ElementsLightingsModule,
    ElementsMoodsModule,
    ElementsScenesModule,
    ElementsSoundsModule,
    ElementsStylesModule,
  ],
  providers: [ElementsService],
})
export class ElementsModule {}
