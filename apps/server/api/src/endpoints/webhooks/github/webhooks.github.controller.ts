import { GitHubSecretAlertDto } from '@api/endpoints/webhooks/dto/github-secret-alert.dto';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Headers,
  ParseArrayPipe,
  Post,
  RawBody,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { GitHubWebhookService } from './webhooks.github.service';

@ApiExcludeController()
@Controller('webhooks/github')
export class GitHubWebhookController {
  constructor(private readonly githubWebhookService: GitHubWebhookService) {}

  @Post('callback')
  @Public()
  async handleCallback(
    @Headers('x-hub-signature-256') signature: string,
    @Body(new ParseArrayPipe({ items: GitHubSecretAlertDto }))
    body: GitHubSecretAlertDto[],
    @RawBody() rawBody: Buffer,
  ) {
    this.githubWebhookService.validateSignature(rawBody, signature);
    const results = await this.githubWebhookService.handleSecretAlerts(body);
    return results;
  }
}
