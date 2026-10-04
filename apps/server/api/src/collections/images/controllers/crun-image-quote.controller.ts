import { CreateCrunImageQuoteDto } from '@api/collections/images/dto/create-crun-image-quote.dto';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CrunPreviewQuoteService } from '@api/services/integrations/crun/crun-preview-quote.service';
import {
  CrunQuoteEndpoint,
  serializeCrunQuote,
} from '@api/services/integrations/crun/crun-quote-endpoint.decorator';
import { ModelCategory } from '@genfeedai/contracts';
import { Body, Controller, Req, UseGuards } from '@nestjs/common';

@Controller('images')
@UseGuards(RolesGuard)
export class CrunImageQuoteController {
  constructor(private readonly preview: CrunPreviewQuoteService) {}
  @CrunQuoteEndpoint(ModelCategory.IMAGE)
  async quote(
    @Body() dto: CreateCrunImageQuoteDto,
    @Req() request: RequestWithContext,
  ) {
    const record = await this.preview.quote(dto, request);
    return serializeCrunQuote(request, record);
  }
}
