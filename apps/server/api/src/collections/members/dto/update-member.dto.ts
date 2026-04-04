import { CreateMemberDto } from '@api/collections/members/dto/create-member.dto';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMemberDto extends PartialType(CreateMemberDto) {
  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether the member is marked as deleted',
    required: false,
  })
  readonly isDeleted?: boolean;
}
