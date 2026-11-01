import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { IIngredientNotificationOwner } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

interface OwnedIngredient {
  id: string;
  organization?: { label?: string } | null;
  organizationId?: string | null;
  user?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
}

/**
 * The account behind a generation for the operator Discord feed: who ran it and
 * what their wallet holds now. Best effort: a failed balance read must never
 * hold back the notification.
 */
@Injectable()
export class IngredientNotificationOwnerService {
  private readonly constructorName = IngredientNotificationOwnerService.name;

  constructor(
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly loggerService: LoggerService,
  ) {}

  async find(
    ingredient: OwnedIngredient,
  ): Promise<IIngredientNotificationOwner> {
    const { organization, user } = ingredient;
    const userName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(' ');
    let creditBalance: number | undefined;
    if (ingredient.organizationId) {
      try {
        creditBalance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            ingredient.organizationId,
          );
      } catch (error: unknown) {
        this.loggerService.warn(
          `${this.constructorName} credit balance unavailable for Discord notification`,
          { error: getErrorMessage(error), ingredientId: ingredient.id },
        );
      }
    }
    return {
      creditBalance,
      organizationId: ingredient.organizationId ?? undefined,
      organizationLabel: organization?.label,
      userEmail: user?.email,
      userName: userName || undefined,
    };
  }
}
