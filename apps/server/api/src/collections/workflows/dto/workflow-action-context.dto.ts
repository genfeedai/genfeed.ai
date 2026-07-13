import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Optional conversation-shell authority for a consequential workflow action.
 * Direct routed actions keep their existing session/RBAC path; when either
 * field is supplied the authorization adapter requires both and revalidates
 * the server-owned thread scope before the workflow engine is reached.
 */
export class WorkflowActionContextDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsInt()
  @IsOptional()
  @Min(1)
  readonly expectedContextVersion?: number;

  @ApiPropertyOptional({ description: 'Active agent thread ID' })
  @IsEntityId()
  @IsOptional()
  readonly threadId?: string;
}
