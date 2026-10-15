import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RetryAccountGenerationDto {
  @IsUUID('4')
  @ApiProperty({
    description:
      'Idempotency key (UUID v4) of this retry. A repeat returns the original attempt without a second charge; a new attempt needs a new key.',
  })
  readonly requestKey!: string;
}
