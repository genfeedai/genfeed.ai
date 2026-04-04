import { CreateListingDto } from '@api/marketplace/listings/dto/create-listing.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateListingDto extends PartialType(CreateListingDto) {}
