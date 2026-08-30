'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IBrandOsPreview } from '@genfeedai/interfaces';
import { PublicService } from '@services/external/public.service';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import {
  WEBSITE_ANALYTICS_EVENTS,
  type WebsiteAnalyticsEventProperties,
} from '../../../packages/analytics/analytics-events';
import { captureWebsiteAnalyticsEvent } from '../../../packages/analytics/posthog-client';
import { buildAuthHandoffHref } from '../../../packages/auth/auth-handoff';
import {
  BrandOSPreviewState,
  type BrandOSPreviewStateName,
} from './brand-os-preview-state';

function captureBrandOsWebsiteEvent<
  E extends
    | typeof WEBSITE_ANALYTICS_EVENTS.BRAND_OS_AUTH_HANDOFF
    | typeof WEBSITE_ANALYTICS_EVENTS.BRAND_OS_CTA_VIEWED
    | typeof WEBSITE_ANALYTICS_EVENTS.BRAND_OS_INTAKE_STARTED
    | typeof WEBSITE_ANALYTICS_EVENTS.BRAND_OS_PREVIEW_COMPLETED,
>(event: E, properties: WebsiteAnalyticsEventProperties[E]): void {
  captureWebsiteAnalyticsEvent(event, properties);
}

function resolvePreviewState(
  preview: IBrandOsPreview,
): 'blocked' | 'partial' | 'ready' {
  if (preview.draft.status === 'blocked') {
    return 'blocked';
  }
  if (
    preview.draft.status === 'partial' ||
    preview.draft.status === 'missing'
  ) {
    return 'partial';
  }
  return 'ready';
}

function isBlockedPreviewError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return false;
  }
  const response = (error as { response?: { status?: number } }).response;
  return response?.status === 400 || response?.status === 422;
}

export function BrandOsFunnel(): React.ReactElement {
  const [url, setUrl] = useState('');
  const [guidance, setGuidance] = useState('');
  const [preview, setPreview] = useState<IBrandOsPreview | null>(null);
  const [state, setState] = useState<BrandOSPreviewStateName>('idle');
  const [error, setError] = useState<string | null>(null);
  const intakeCapturedRef = useRef(false);
  const viewedRef = useRef(false);
  const handoffCapturedRef = useRef(new Set<'sign_in' | 'sign_up'>());
  const previewInFlightRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) {
      return;
    }
    viewedRef.current = true;
    captureBrandOsWebsiteEvent(WEBSITE_ANALYTICS_EVENTS.BRAND_OS_CTA_VIEWED, {
      surface: 'brand_os',
    });
  }, []);

  const handleInputStarted = (kind: 'manual' | 'url') => {
    setPreview(null);
    setError(null);
    setState('input-started');
    if (!intakeCapturedRef.current) {
      intakeCapturedRef.current = true;
      captureBrandOsWebsiteEvent(
        WEBSITE_ANALYTICS_EVENTS.BRAND_OS_INTAKE_STARTED,
        { intakeKind: kind },
      );
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (previewInFlightRef.current) {
      return;
    }
    const normalizedUrl = url.trim();
    const normalizedGuidance = guidance.trim();
    if (Boolean(normalizedUrl) === Boolean(normalizedGuidance)) {
      setError('Enter either one public URL or manual guidance.');
      setState('missing-evidence');
      return;
    }

    setError(null);
    setPreview(null);
    setState('scanning');
    previewInFlightRef.current = true;
    try {
      const result = await PublicService.getInstance().previewBrandOs({
        ...(normalizedGuidance ? { guidance: normalizedGuidance } : {}),
        ...(normalizedUrl ? { url: normalizedUrl } : {}),
      });
      const nextState = resolvePreviewState(result);
      setPreview(result);
      setState(nextState);
      captureBrandOsWebsiteEvent(
        WEBSITE_ANALYTICS_EVENTS.BRAND_OS_PREVIEW_COMPLETED,
        { outcome: nextState },
      );
    } catch (previewError) {
      const nextState = isBlockedPreviewError(previewError)
        ? 'blocked'
        : 'error';
      setState(nextState);
      setError(
        nextState === 'blocked'
          ? 'That source cannot be scanned safely. Use a public URL or manual guidance.'
          : 'The preview service is temporarily unavailable. Your input was not saved.',
      );
      captureBrandOsWebsiteEvent(
        WEBSITE_ANALYTICS_EVENTS.BRAND_OS_PREVIEW_COMPLETED,
        { outcome: nextState },
      );
    } finally {
      previewInFlightRef.current = false;
    }
  };

  const captureHandoff = (authMode: 'sign_in' | 'sign_up') => {
    if (handoffCapturedRef.current.has(authMode)) {
      return;
    }
    handoffCapturedRef.current.add(authMode);
    captureBrandOsWebsiteEvent(WEBSITE_ANALYTICS_EVENTS.BRAND_OS_AUTH_HANDOFF, {
      authMode,
    });
  };

  return (
    <div className="grid gap-6">
      <form
        aria-label="Brand OS preview intake"
        className="grid gap-4 bg-background p-5 shadow-border sm:p-6"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <Field
          description="Public http or https pages only. Private networks and redirect escapes are blocked."
          label="Website URL"
        >
          <Input
            autoComplete="url"
            maxLength={2048}
            placeholder="https://example.com"
            type="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (event.target.value.trim()) {
                setGuidance('');
                handleInputStarted('url');
              } else if (!guidance.trim()) {
                setState('idle');
              }
            }}
          />
        </Field>

        <div aria-hidden="true" className="text-center text-xs text-surface/55">
          or
        </div>

        <Field
          description="Up to 12,000 characters. Guidance stays in the preview payload and never enters the auth URL or analytics."
          label="Manual brand guidance"
        >
          <Textarea
            maxLength={12000}
            placeholder="Describe your audience, voice, positioning, and visual direction."
            rows={5}
            value={guidance}
            onChange={(event) => {
              setGuidance(event.target.value);
              if (event.target.value.trim()) {
                setUrl('');
                handleInputStarted('manual');
              } else if (!url.trim()) {
                setState('idle');
              }
            }}
          />
        </Field>

        {error ? (
          <Text className="text-sm text-destructive" role="alert">
            {error}
          </Text>
        ) : null}

        <Button
          ariaLabel="Build Brand OS preview"
          isDisabled={state === 'scanning' || (!url.trim() && !guidance.trim())}
          isLoading={state === 'scanning'}
          label="Build preview"
          size={ButtonSize.PUBLIC}
          type="submit"
          withWrapper={false}
        />
      </form>

      <BrandOSPreviewState
        announce
        draft={preview?.draft}
        scaleRole="monument"
        showEvidence={Boolean(preview)}
        state={state}
      />

      {preview ? (
        <div
          aria-live="polite"
          className="flex flex-col gap-3 bg-background p-5 shadow-border sm:p-6"
          data-brand-os-state="conversion-prompted"
        >
          <Text className="text-sm leading-6 text-surface/70">
            Save this source-backed draft to a workspace. Only the short-lived
            opaque handoff token crosses authentication.
          </Text>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size={ButtonSize.PUBLIC} withWrapper={false}>
              <Link
                data-ph-no-capture
                href={buildAuthHandoffHref(
                  'sign-up',
                  'brandOsToken',
                  preview.previewToken,
                )}
                onClick={() => captureHandoff('sign_up')}
              >
                Create workspace and save
              </Link>
            </Button>
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <Link
                data-ph-no-capture
                href={buildAuthHandoffHref(
                  'login',
                  'brandOsToken',
                  preview.previewToken,
                )}
                onClick={() => captureHandoff('sign_in')}
              >
                Sign in and save
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
