import { OutliersController } from '@api/collections/outliers/controllers/outliers.controller';
import { OutliersCoreModule } from '@api/collections/outliers/outliers-core.module';
import { Module } from '@nestjs/common';
@Module({ imports: [OutliersCoreModule], controllers: [OutliersController] })
export class OutliersModule {}
