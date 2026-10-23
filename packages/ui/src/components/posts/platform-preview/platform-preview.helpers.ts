import { TargetValidationState } from '@genfeedai/contracts';
import type {
  PlatformPreviewStatus,
  PlatformPreviewTarget,
  ResolvedPlatformPreviewTarget,
} from '@genfeedai/props/components/platform-preview.props';
import { DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME } from '@ui/posts/platform-preview/PlatformPreview.data';

export function formatHandle(handle?: string): string | undefined {
  const normalizedHandle = handle?.trim();
  if (!normalizedHandle) {
    return undefined;
  }

  return normalizedHandle.startsWith('@')
    ? normalizedHandle
    : `@${normalizedHandle}`;
}

export function getAuthorName(target: PlatformPreviewTarget): string {
  return target.author?.name?.trim() || DEFAULT_PLATFORM_PREVIEW_AUTHOR_NAME;
}

export function getPreviewStatus(
  target: ResolvedPlatformPreviewTarget,
): PlatformPreviewStatus {
  if (
    target.validation.validationState === TargetValidationState.INVALID ||
    target.validation.errors.length > 0
  ) {
    return {
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
      messageKey: 'blocked',
    };
  }

  if (
    target.validation.validationState === TargetValidationState.WARNING ||
    target.validation.warnings.length > 0
  ) {
    return {
      className: 'border-warning/30 bg-warning/10 text-warning',
      messageKey: 'warnings',
    };
  }

  return {
    className: 'border-success/25 bg-success/10 text-success',
    messageKey: 'valid',
  };
}

export function extractFirstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s]+/)?.[0] ?? null;
}
