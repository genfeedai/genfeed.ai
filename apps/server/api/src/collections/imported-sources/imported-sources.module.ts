import { ImportedSourcesController } from '@api/collections/imported-sources/controllers/imported-sources.controller';
import { ImportedSourcesService } from '@api/collections/imported-sources/services/imported-sources.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [PrismaModule],
  controllers: [ImportedSourcesController],
  providers: [ImportedSourcesService],
  exports: [ImportedSourcesService],
})
export class ImportedSourcesModule {}
