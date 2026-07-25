import { WebhookPayloadDto } from '@api/endpoints/webhooks/dto/webhook-payload.dto';
import type {
  LeonardoAIWebhookData,
  LeonardoAIWebhookImage,
  LeonardoAIWebhookPayload,
} from '@libs/interfaces/webhook-payload.interface';
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Body of `POST /webhooks/leonardoai/callback`.
 *
 * Everything is optional and `data` is checked at the container level only. The
 * controller deliberately answers `{ success: false }` rather than throwing when
 * `data.object` is missing, so a vendor envelope change never becomes a 500 and
 * a retry storm; validating the nested generation here would reintroduce exactly
 * that failure mode as a 400.
 *
 * `@IsOptional()` also skips `null`, which matters because the interface allows
 * `data: null`.
 *
 * @see https://docs.leonardo.ai/docs/webhooks
 */
export class LeonardoAIWebhookPayloadDto
  extends WebhookPayloadDto
  implements LeonardoAIWebhookPayload
{
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Leonardo.AI event type', required: false })
  type?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'Correlation id sent on the generation',
    required: false,
  })
  customId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Generation id', required: false })
  generationId?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Generation lifecycle status', required: false })
  status?: string;

  @IsArray()
  @IsOptional()
  @ApiProperty({ description: 'Generated images', required: false })
  images?: LeonardoAIWebhookImage[];

  @IsObject()
  @IsOptional()
  @ApiProperty({ description: 'Event envelope', required: false })
  data?: LeonardoAIWebhookData | null;
}
