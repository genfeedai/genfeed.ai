import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/**
 * Resolves "Require approval for MCP requests" for one member of one organization.
 *
 * Two switches, both on by default: the organization's policy (it owns the credit pool) and
 * the member's own preference. A call skips the approvals queue only when both are
 * explicitly off. A missing row or a failed read counts as on, so a lookup can never waive
 * an approval. Read fresh on every decision, so turning a switch back on takes effect at
 * once.
 */
@Injectable()
export class McpApprovalPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async isApprovalRequired(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    if (!organizationId || !userId) return true;
    try {
      const [organization, member] = await Promise.all([
        this.prisma.organizationSetting.findFirst({
          select: { isMcpApprovalRequired: true },
          where: { organizationId },
        }),
        this.prisma.setting.findFirst({
          select: { isMcpApprovalRequired: true },
          where: { isDeleted: false, userId },
        }),
      ]);
      return !(
        organization?.isMcpApprovalRequired === false &&
        member?.isMcpApprovalRequired === false
      );
    } catch {
      return true;
    }
  }
}
