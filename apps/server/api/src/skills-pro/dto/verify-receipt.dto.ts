import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VerifyReceiptDto {
  @IsString()
  @ApiProperty({
    description: 'Receipt ID to verify (format: sk_rcpt_<id>)',
  })
  readonly receiptId!: string;
}
