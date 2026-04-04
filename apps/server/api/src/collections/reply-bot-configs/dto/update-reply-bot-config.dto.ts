import { CreateReplyBotConfigDto } from '@api/collections/reply-bot-configs/dto/create-reply-bot-config.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateReplyBotConfigDto extends PartialType(
  CreateReplyBotConfigDto,
) {}
