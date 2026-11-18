import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/**
 * Resolves "Require approval for MCP requests" for one member of one organization.
 *
 * Two switches, both off by default: the organization's policy (it owns the credit pool) and
 * the member's own preference. A call waits in the approvals queue as soon as either one is
 * on, so a member can only relax the organization's choice. A missing row follows the
 * default (off). A failed read counts as on, so an error can never waive an approval. Read
 * fresh on every decision, so turning a switch on takes effect at once.
 */
@Traced()
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
      return (
        organization?.isMcpApprovalRequired === true ||
        member?.isMcpApprovalRequired === true
      );
    } catch {
      return true;
    }
  }
}
