import { PartialType } from '@nestjs/swagger';
import { CreateSocialSourceDto } from './create-social-source.dto';

export class UpdateSocialSourceDto extends PartialType(CreateSocialSourceDto) {}
