import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class RollbackHarnessProfileDto {
  @ApiProperty({
    description: 'Revision number whose content is restored as a new revision',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  version!: number;
}
