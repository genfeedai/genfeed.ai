import type { PrepareBrandDto } from '@api/endpoints/onboarding/dto/proactive-onboarding.dto';
import { ProactiveOnboardingStatus } from '@genfeedai/contracts';
import type {
  IProactivePreparationStatus,
  IScrapedBrandData,
} from '@genfeedai/contracts/interfaces';

export function getProactivePrepStage(
  status?: ProactiveOnboardingStatus,
): string {
  switch (status) {
    case ProactiveOnboardingStatus.BRAND_PREPARING:
      return 'researching_brand';
    case ProactiveOnboardingStatus.BRAND_READY:
      return 'brand_ready';
    case ProactiveOnboardingStatus.CONTENT_GENERATING:
      return 'generating_outputs';
    case ProactiveOnboardingStatus.CONTENT_READY:
    case ProactiveOnboardingStatus.INVITED:
    case ProactiveOnboardingStatus.STARTED:
    case ProactiveOnboardingStatus.PAYMENT_MADE:
    case ProactiveOnboardingStatus.CONVERTED:
      return 'ready';
    default:
      return 'not_started';
  }
}

export function getProactivePrepPercent(
  status?: ProactiveOnboardingStatus,
): number {
  switch (status) {
    case ProactiveOnboardingStatus.BRAND_PREPARING:
      return 25;
    case ProactiveOnboardingStatus.BRAND_READY:
      return 55;
    case ProactiveOnboardingStatus.CONTENT_GENERATING:
      return 80;
    case ProactiveOnboardingStatus.CONTENT_READY:
    case ProactiveOnboardingStatus.INVITED:
    case ProactiveOnboardingStatus.STARTED:
    case ProactiveOnboardingStatus.PAYMENT_MADE:
    case ProactiveOnboardingStatus.CONVERTED:
      return 100;
    default:
      return 0;
  }
}

export function isProactiveInviteEligible(
  status?: ProactiveOnboardingStatus,
): boolean {
  return [
    ProactiveOnboardingStatus.CONTENT_READY,
    ProactiveOnboardingStatus.INVITED,
    ProactiveOnboardingStatus.STARTED,
    ProactiveOnboardingStatus.PAYMENT_MADE,
    ProactiveOnboardingStatus.CONVERTED,
  ].includes(status as ProactiveOnboardingStatus);
}

export function buildProactiveWorkspaceSummary(
  status: Pick<IProactivePreparationStatus, 'brand' | 'organization'>,
  outputCount: number,
): string {
  const parts = [
    status.organization?.label
      ? `${status.organization.label} is prebuilt`
      : 'Your workspace is prebuilt',
    status.brand?.name ? `with ${status.brand.name} context` : undefined,
    outputCount > 0 ? `and ${outputCount} starter outputs ready` : undefined,
  ].filter(Boolean);

  return `${parts.join(' ')}.`;
}

export function buildProactiveBrandSystemPrompt(
  scrapedData: IScrapedBrandData,
  dto: PrepareBrandDto,
): string {
  const parts: string[] = [];

  if (scrapedData.companyName) {
    parts.push(`You are creating content for ${scrapedData.companyName}.`);
  }

  if (scrapedData.tagline) {
    parts.push(`Brand tagline: "${scrapedData.tagline}"`);
  }

  if (scrapedData.aboutText) {
    parts.push(`About the brand: ${scrapedData.aboutText}`);
  }

  if (dto.industry) {
    parts.push(`Industry: ${dto.industry}`);
  }

  if (dto.targetAudience) {
    parts.push(`Target audience: ${dto.targetAudience}`);
  }

  return parts.join('\n\n');
}
