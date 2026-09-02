import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateBotDto extends PartialType(CreateBotDto) {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    description: 'Whether this bot is deleted',
    required: false,
  })
  isDeleted?: boolean;
}
