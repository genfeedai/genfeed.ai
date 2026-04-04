import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { PartialType } from '@nestjs/swagger';

/**
 * Update DTO for workflows
 * All fields from CreateWorkflowDto are optional
 */
export class UpdateWorkflowDto extends PartialType(CreateWorkflowDto) {}
