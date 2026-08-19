import { CreatePostingSignatureDto } from '@api/collections/posting-sets/dto/create-posting-signature.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdatePostingSignatureDto extends PartialType(
  CreatePostingSignatureDto,
) {}
