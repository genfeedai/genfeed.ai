import { OutlierLibraryService } from '@api/collections/outlier-library/services/outlier-library.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [OutlierLibraryService],
  imports: [PrismaModule],
  providers: [OutlierLibraryService],
})
export class OutlierLibraryModule {}
