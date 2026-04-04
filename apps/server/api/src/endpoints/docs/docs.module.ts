import { DocsController } from '@api/endpoints/docs/docs.controller';
import { DocsService } from '@api/endpoints/docs/docs.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  controllers: [DocsController],
  exports: [DocsService],
  providers: [DocsService],
})
export class DocsModule {}
