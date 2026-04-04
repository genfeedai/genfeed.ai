import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UploadNftDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'NFT address on Solana blockchain',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    required: true,
  })
  readonly address!: string;
}
