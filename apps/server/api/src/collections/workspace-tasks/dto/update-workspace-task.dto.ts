import { PartialType } from '@nestjs/swagger';
import { CreateWorkspaceTaskDto } from './create-workspace-task.dto';

export class UpdateWorkspaceTaskDto extends PartialType(
  CreateWorkspaceTaskDto,
) {}
