import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyReceiptDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @ApiProperty({
    description: 'Receipt ID to verify (format: sk_rcpt_<id>)',
  })
  readonly receiptId!: string;
}
