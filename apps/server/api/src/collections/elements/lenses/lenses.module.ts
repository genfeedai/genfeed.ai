import { ElementsLensesController } from '@api/collections/elements/lenses/controllers/lenses.controller';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ElementsLensesController],
  exports: [ElementsLensesService],
  imports: [],
  providers: [ElementsLensesService],
})
export class ElementsLensesModule {}
