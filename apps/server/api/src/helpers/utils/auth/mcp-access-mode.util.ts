import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  isToolAllowedInMcpAccessMode,
  parseMcpAccessMode,
} from '@genfeedai/actions';
import { ForbiddenException } from '@nestjs/common';

export function assertMcpAccessModeAllowsTool(
  user: Partial<AuthenticatedUser>,
  name: string,
  surface: 'mcp' | 'agent',
): void {
  if (
    !isToolAllowedInMcpAccessMode(
      parseMcpAccessMode(user.mcpAccessMode),
      name,
      surface,
    )
  ) {
    throw new ForbiddenException({
      code: 'MCP_ACCESS_MODE_TOOL_BLOCKED',
      message:
        'This operation is unavailable through the Claude connector. Create assets in Genfeed Studio.',
    });
  }
}
