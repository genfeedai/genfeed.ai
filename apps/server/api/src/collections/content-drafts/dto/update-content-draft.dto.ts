import { CreateContentDraftDto } from '@api/collections/content-drafts/dto/create-content-draft.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateContentDraftDto extends PartialType(CreateContentDraftDto) {}
