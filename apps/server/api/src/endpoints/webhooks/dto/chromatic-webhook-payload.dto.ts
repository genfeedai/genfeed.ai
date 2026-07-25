import { WebhookPayloadDto } from '@api/endpoints/webhooks/dto/webhook-payload.dto';
import type { ChromaticWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /webhooks/chromatic/callback`.
 *
 * This DTO is load-bearing for the existing signature check: the controller
 * computes its HMAC over `JSON.stringify(payload)`, i.e. over the pipe's OUTPUT,
 * not the raw request. That is only safe because `WebhookPayloadDto` opts out of
 * whitelist stripping and the DTO declares no field initializers — with
 * `useDefineForClassFields: false` and no `@Expose` metadata, `plainToInstance`
 * copies exactly the source keys in source order, so the re-serialized body is
 * byte-identical to the one Chromatic signed. `chromatic-webhook-payload.dto.spec.ts`
 * pins that round trip; do not add initializers, `@Expose`, or nested DTO types
 * here without re-checking it.
 *
 * @see https://www.chromatic.com/docs/custom-webhooks
 */
export class ChromaticWebhookPayloadDto
  extends WebhookPayloadDto
  implements ChromaticWebhookPayload
{
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Chromatic event name', required: false })
  event?: string;

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Build summary', required: false })
  build?: ChromaticWebhookPayload['build'];

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Project the build belongs to', required: false })
  project?: ChromaticWebhookPayload['project'];

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Commit the build ran against', required: false })
  commit?: ChromaticWebhookPayload['commit'];

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Branch the build ran against', required: false })
  branch?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Event timestamp', required: false })
  timestamp?: string;
}
