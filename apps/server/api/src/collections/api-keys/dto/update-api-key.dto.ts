import { CreateApiKeyDto } from '@api/collections/api-keys/dto/create-api-key.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateApiKeyDto extends PartialType(CreateApiKeyDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the key is marked as deleted',
    required: false,
  })
  readonly isDeleted!: boolean;
}
