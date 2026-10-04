import { ORGANIZATION_CREATED_EVENT } from '@api/collections/organizations/constants/organization-events.constants';
import type { OrganizationCreatedEvent } from '@api/collections/organizations/organization-events.types';
import { SignupPrefillWorkflowService } from '@api/services/signup-prefill/signup-prefill-workflow.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * Runs the signup brand prefill on the default brand of an organization
 * created after signup, so it starts with a system prompt, strategy defaults
 * and a harness profile instead of an empty brand.
 *
 * Only the website the creator typed is scanned. The creator's email domain is
 * deliberately not passed: it identifies their first company, not this one.
 */
@Injectable()
export class OrganizationCreatedPrefillListener {
  private readonly context = {
    service: OrganizationCreatedPrefillListener.name,
  };

  constructor(
    private readonly signupPrefillWorkflowService: SignupPrefillWorkflowService,
    private readonly loggerService: LoggerService,
  ) {}

  @OnEvent(ORGANIZATION_CREATED_EVENT)
  async handleOrganizationCreated(
    event: OrganizationCreatedEvent,
  ): Promise<void> {
    try {
      await this.signupPrefillWorkflowService.enqueuePrefill(
        {
          brandId: event.brandId,
          ...(event.websiteUrl ? { brandDomain: event.websiteUrl } : {}),
          organizationId: event.organizationId,
          userId: event.userId,
        },
        'organization-create',
      );
    } catch (error: unknown) {
      // Best-effort: the organization and its brand are already usable.
      this.loggerService.warn(
        'Could not queue brand prefill for new organization',
        {
          ...this.context,
          brandId: event.brandId,
          error: error instanceof Error ? error.message : String(error),
          organizationId: event.organizationId,
        },
      );
    }
  }
}
