import { Public } from '@libs/decorators/public.decorator';
import { Body, Controller, Headers, Post, RawBody } from '@nestjs/common';
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
    @Body() body: unknown[],
    @RawBody() rawBody: Buffer,
  ) {
    this.githubWebhookService.validateSignature(rawBody, signature);
    const results = await this.githubWebhookService.handleSecretAlerts(body);
    return results;
  }
}
