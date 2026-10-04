import { CreateCrunVideoQuoteDto } from '@api/collections/videos/dto/create-crun-video-quote.dto';
import { CrunVideoPreviewQuoteService } from '@api/collections/videos/services/crun-video-preview-quote.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  CrunQuoteEndpoint,
  serializeCrunQuote,
} from '@api/services/integrations/crun/crun-quote-endpoint.decorator';
import { ModelCategory } from '@genfeedai/contracts';
import { Body, Controller, Req, UseGuards } from '@nestjs/common';

@Controller('videos')
@UseGuards(RolesGuard)
export class CrunVideoQuoteController {
  constructor(private readonly preview: CrunVideoPreviewQuoteService) {}
  @CrunQuoteEndpoint(ModelCategory.VIDEO)
  async quote(
    @Body() dto: CreateCrunVideoQuoteDto,
    @Req() request: RequestWithContext,
  ) {
    const record = await this.preview.quote(dto, request);
    return serializeCrunQuote(request, record);
  }
}
