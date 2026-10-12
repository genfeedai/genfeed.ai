import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import type { ReactElement } from 'react';
import type {
  SourceRemixDraftViewProps,
  SourceRemixQuoteViewProps,
  SourceRemixResultViewProps,
} from '~models/source-remix.model';
import {
  quoteSummary,
  REMIX_ASPECT_RATIOS,
  REMIX_TARGET_PLATFORMS,
} from '~utils/source-remix-view.util';

const COUNTS = ['1', '2', '3'];

function Labelled({
  children,
  label,
}: {
  children: ReactElement;
  label: string;
}): ReactElement {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{label}</p>
      {children}
    </div>
  );
}

export function SourceRemixDraftView({
  isBusy,
  model,
  models,
  onEdit,
  onModelChange,
  onQuote,
  run,
}: SourceRemixDraftViewProps): ReactElement {
  const { output, target } = run.draft;
  const isImage = output.kind === 'image';
  const isBlocked = run.readiness.state === 'blocked';
  return (
    <div className="space-y-3">
      {run.readiness.issues.length ? (
        <ul className="space-y-1" aria-label="Readiness">
          {run.readiness.issues.map((issue) => (
            <li
              className={
                issue.severity === 'blocked'
                  ? 'text-xs text-destructive'
                  : 'text-xs text-muted-foreground'
              }
              key={`${issue.code}:${issue.field}`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      {run.concept?.hook || run.concept?.angle ? (
        <div className="space-y-1 rounded-lg border border-border p-2">
          {run.concept.angle ? (
            <p className="text-xs">{`Angle: ${run.concept.angle}`}</p>
          ) : null}
          {run.concept.hook ? (
            <p className="text-xs">{`Hook: ${run.concept.hook}`}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Only abstract signals from the source are used, never its wording.
          </p>
        </div>
      ) : null}
      <Labelled label="Output">
        <Select
          disabled={isBusy}
          value={output.kind}
          onValueChange={(value) =>
            onEdit(
              value === 'image'
                ? { output: { aspectRatio: '1:1', kind: 'image' } }
                : { output: { kind: 'copy' } },
            )
          }
        >
          <SelectTrigger aria-label="Output" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="copy">Copy</SelectItem>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
      </Labelled>
      <Labelled label="Target platform">
        <Select
          disabled={isBusy}
          value={target.platform}
          onValueChange={(value) =>
            onEdit({
              target: {
                kind: 'organic',
                platform: value as 'instagram' | 'tiktok' | 'x' | 'youtube',
              },
            })
          }
        >
          <SelectTrigger aria-label="Target platform" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REMIX_TARGET_PLATFORMS.map((platform) => (
              <SelectItem key={platform.value} value={platform.value}>
                {platform.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Labelled>
      <Labelled label="Variations">
        <Select
          disabled={isBusy}
          value={String(output.count)}
          onValueChange={(value) =>
            onEdit({ output: { count: Number(value) } })
          }
        >
          <SelectTrigger aria-label="Variations" className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTS.map((count) => (
              <SelectItem key={count} value={count}>
                {count}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Labelled>
      {output.kind === 'image' ? (
        <>
          <Labelled label="Aspect ratio">
            <Select
              disabled={isBusy}
              value={output.aspectRatio}
              onValueChange={(value) =>
                onEdit({ output: { aspectRatio: value } })
              }
            >
              <SelectTrigger aria-label="Aspect ratio" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMIX_ASPECT_RATIOS.map((ratio) => (
                  <SelectItem key={ratio} value={ratio}>
                    {ratio}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labelled>
          <Labelled label="Image model">
            <Select
              disabled={isBusy || models.length === 0}
              value={model}
              onValueChange={onModelChange}
            >
              <SelectTrigger aria-label="Image model" className="h-8 text-xs">
                <SelectValue placeholder="Choose a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Labelled>
        </>
      ) : null}
      <Button
        isDisabled={isBusy || isBlocked || (isImage && !model)}
        onClick={onQuote}
        type="button"
      >
        {isBusy ? 'Working…' : 'Get a price'}
      </Button>
      <p className="text-xs text-muted-foreground">
        A price is only a quote. Nothing is generated or charged until you
        approve it.
      </p>
    </div>
  );
}

export function SourceRemixQuoteView({
  isBusy,
  onApprove,
  onChange,
  run,
}: SourceRemixQuoteViewProps): ReactElement | null {
  const quote = run.generationQuote;
  if (!quote) {
    return null;
  }
  return (
    <section className="space-y-3" aria-label="Price">
      <p className="text-sm font-medium">{quoteSummary(quote)}</p>
      <p className="text-xs text-muted-foreground">
        {`Model ${quote.model}. This price expires at ${new Date(quote.expiresAt).toLocaleTimeString()}.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={isBusy} onClick={onApprove} type="button">
          {isBusy ? 'Starting…' : 'Approve and generate'}
        </Button>
        <Button
          isDisabled={isBusy}
          onClick={onChange}
          type="button"
          variant={ButtonVariant.SECONDARY}
        >
          Change settings
        </Button>
      </div>
    </section>
  );
}

export function SourceRemixResultView({
  isBusy,
  onCopy,
  onOpenStudio,
  onRemixAgain,
  run,
  sourceTitle,
}: SourceRemixResultViewProps): ReactElement {
  const variants = run.execution?.variants ?? [];
  const isCopy = run.draft.output.kind === 'copy';
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {isCopy
          ? `Generated from "${sourceTitle}". The original is unchanged.`
          : `Generated from "${sourceTitle}". Each image is a separate Library asset linked to the original source.`}
      </p>
      {variants.map((variant, index) => (
        <div
          className="space-y-1 rounded-lg border border-border p-2"
          key={variant.id}
        >
          <p className="text-xs font-medium">{`Variation ${index + 1}`}</p>
          {variant.status === 'failed' ? (
            <p className="text-xs text-destructive" role="alert">
              {variant.error ?? 'This variation failed.'}
            </p>
          ) : null}
          {variant.status !== 'ready' && variant.status !== 'failed' ? (
            <p className="text-xs text-muted-foreground">Still generating…</p>
          ) : null}
          {variant.content ? (
            <>
              <p className="whitespace-pre-wrap text-sm">{variant.content}</p>
              <Button
                onClick={() => onCopy(variant.content ?? '')}
                type="button"
                variant={ButtonVariant.SECONDARY}
              >
                Copy text
              </Button>
            </>
          ) : null}
          {!isCopy && variant.status === 'ready' ? (
            <p className="text-xs text-muted-foreground">
              {`Saved to your Library (${variant.assetIds.length} ${variant.assetIds.length === 1 ? 'asset' : 'assets'}).`}
            </p>
          ) : null}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={isBusy} onClick={onOpenStudio} type="button">
          Open in Genfeed
        </Button>
        <Button
          isDisabled={isBusy}
          onClick={onRemixAgain}
          type="button"
          variant={ButtonVariant.SECONDARY}
        >
          Start a new remix
        </Button>
      </div>
    </div>
  );
}
