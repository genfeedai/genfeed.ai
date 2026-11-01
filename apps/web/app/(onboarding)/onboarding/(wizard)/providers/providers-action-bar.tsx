import {
  ButtonSize,
  ButtonVariant,
  CardGap,
  CardPadding,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ProvidersActionBarProps } from '@/features/onboarding/props/providers-action-bar.props';

export type { ProvidersAccessSurface } from '@/features/onboarding/props/providers-action-bar.props';

const CURRENT_RING = 'ring-1 ring-border-strong';

function CurrentBadge() {
  return (
    <Badge className="absolute -top-2 right-3 z-10" variant="secondary">
      Current
    </Badge>
  );
}

export default function ProvidersActionBar({
  loading,
  pendingMode,
  selectedMode,
  surface,
  onByokClick,
  onServerContinue,
  onCloudContinue,
  onDesktopContinue,
  onBack,
}: ProvidersActionBarProps) {
  const guidance =
    surface === 'saas'
      ? 'Use Genfeed Cloud for hosted generation, or add your own provider keys with a Scale plan.'
      : surface === 'desktop-local'
        ? 'Local agent CLIs are detected on this Mac. Continue to pick a workspace folder when you are ready.'
        : 'Keep the default server access, open Organization API Keys if you want BYOK, or switch to Genfeed Cloud now if you want a managed setup with brand handoff.';

  return (
    <>
      <Card
        className="provider-card opacity-0"
        padding={CardPadding.LG}
        gap={CardGap.LG}
        bodyClassName="md:flex-row md:items-center md:justify-between"
      >
        <div className="text-sm text-muted-foreground">{guidance}</div>

        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
          {surface === 'desktop-local' ? (
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              onClick={() => {
                onDesktopContinue();
              }}
              label={loading ? 'Checking CLIs...' : 'Continue to workspace'}
              disabled={loading || pendingMode !== null}
              wrapperClassName="w-full md:w-auto"
              className="w-full md:w-auto"
            />
          ) : null}

          {surface !== 'desktop-local' ? (
            <div className="relative w-full md:w-auto">
              {selectedMode === 'byok' ? <CurrentBadge /> : null}
              <Link
                href={APP_ROUTES.SETTINGS.API_KEYS}
                onClick={(event) => {
                  onByokClick(event);
                }}
                className={`inline-flex w-full items-center justify-center rounded-full border border-border bg-tertiary px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-border-strong hover:bg-hover md:w-auto ${
                  selectedMode === 'byok' ? CURRENT_RING : ''
                }`}
              >
                Add my own API keys
              </Link>
            </div>
          ) : null}

          {surface === 'self-hosted' ? (
            <div className="relative w-full md:w-auto">
              {selectedMode === 'server' ? <CurrentBadge /> : null}
              <Button
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.SM}
                onClick={() => {
                  onServerContinue();
                }}
                label={
                  loading
                    ? 'Loading summary...'
                    : pendingMode === 'server'
                      ? 'Saving server mode...'
                      : 'Continue with server defaults'
                }
                disabled={loading || pendingMode !== null}
                wrapperClassName="w-full md:w-auto"
                className={`w-full md:w-auto ${
                  selectedMode === 'server' ? CURRENT_RING : ''
                }`}
              />
            </div>
          ) : null}

          <div className="relative w-full md:w-auto">
            {selectedMode === 'cloud' ? <CurrentBadge /> : null}
            <Button
              variant={
                surface === 'saas' ? ButtonVariant.DEFAULT : ButtonVariant.GHOST
              }
              size={ButtonSize.SM}
              onClick={() => {
                onCloudContinue();
              }}
              label={
                pendingMode === 'cloud'
                  ? 'Opening Genfeed Cloud...'
                  : 'Use Genfeed Cloud'
              }
              disabled={loading || pendingMode !== null}
              wrapperClassName="w-full md:w-auto"
              className={`w-full rounded-full border border-border bg-tertiary text-foreground hover:border-border-strong hover:bg-hover md:w-auto ${
                selectedMode === 'cloud' ? CURRENT_RING : ''
              }`}
            />
          </div>
        </div>
      </Card>

      <div className="provider-card opacity-0 flex items-center justify-between gap-4 pt-2">
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          withWrapper={false}
          onClick={onBack}
          icon={<ArrowLeft className="size-4" />}
          className="h-8 rounded-full border border-border bg-tertiary px-4 text-muted-foreground hover:border-border-strong hover:bg-hover hover:text-foreground"
        >
          Back
        </Button>

        <div className="step-badge inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-border bg-tertiary px-4 text-2xs font-black uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="size-3" />
          Step 2 of 3
        </div>
      </div>
    </>
  );
}
