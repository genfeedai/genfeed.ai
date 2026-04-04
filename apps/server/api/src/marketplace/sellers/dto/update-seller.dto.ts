import { CreateSellerDto } from '@api/marketplace/sellers/dto/create-seller.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateSellerDto extends PartialType(CreateSellerDto) {}
