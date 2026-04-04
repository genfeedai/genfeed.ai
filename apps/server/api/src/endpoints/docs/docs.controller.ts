import { DocsService } from '@api/endpoints/docs/docs.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get } from '@nestjs/common';

@AutoSwagger('docs')
@Controller()
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Public()
  @Get('openapi.json')
  getOpenApiSpec() {
    return this.docsService.getOpenApiDocument();
  }

  @Public()
  @Get('gpt-actions.json')
  getGptActionsSpec() {
    return this.docsService.getGptActionsSpec();
  }
}
