import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { Building2, CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useId,
  useMemo,
  useState,
} from 'react';

interface BrandIdentityConfirmationCardProps {
  action: AgentUiAction;
  onUiAction?: (
    action: string,
    payload?: Record<string, unknown>,
  ) => Promise<boolean>;
}

type BrandIdentityOperation = 'create' | 'rename';

interface BrandIdentityValue {
  description: string;
  label: string;
  slug: string;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function BrandIdentityConfirmationCard({
  action,
  onUiAction,
}: BrandIdentityConfirmationCardProps): ReactElement {
  const translate = useTranslations('agent.brandIdentityConfirmation');
  const labelInputId = useId();
  const slugInputId = useId();
  const descriptionInputId = useId();
  const data = useMemo(() => readRecord(action.data), [action.data]);
  const operation: BrandIdentityOperation =
    data.operation === 'rename' ? 'rename' : 'create';
  const proposal = useMemo(() => readRecord(data.proposal), [data.proposal]);
  const currentIdentity = useMemo(
    () => readRecord(data.currentIdentity),
    [data.currentIdentity],
  );
  const initialValue = useMemo<BrandIdentityValue>(
    () => ({
      description: readString(proposal.description),
      label: readString(proposal.label),
      slug: readString(proposal.slug),
    }),
    [proposal],
  );
  const confirmationCta = action.ctas?.find((cta) => cta.action);
  const sourceActionId =
    readString(data.sourceActionId) ||
    readString(confirmationCta?.payload?.sourceActionId) ||
    action.id;
  const [description, setDescription] = useState(initialValue.description);
  const [label, setLabel] = useState(initialValue.label);
  const [slug, setSlug] = useState(initialValue.slug);
  const [isPending, setIsPending] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInteractive = Boolean(onUiAction && confirmationCta?.action);

  const handleLabelChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setLabel(event.target.value);
    },
    [],
  );

  const handleSlugChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSlug(event.target.value);
    },
    [],
  );

  const handleDescriptionChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(event.target.value);
    },
    [],
  );

  const handleConfirm = useCallback(async () => {
    const trimmedLabel = label.trim();
    const trimmedSlug = slug.trim();

    if (
      !confirmationCta?.action ||
      !onUiAction ||
      !trimmedLabel ||
      !trimmedSlug ||
      isPending ||
      isConfirmed
    ) {
      return;
    }

    setError(null);
    setIsPending(true);

    try {
      const outcome = await onUiAction(confirmationCta.action, {
        ...confirmationCta.payload,
        label: trimmedLabel,
        slug: trimmedSlug,
        ...(operation === 'create' ? { description: description.trim() } : {}),
        sourceActionId,
      });
      if (outcome !== true) {
        throw new Error('Brand confirmation was not accepted.');
      }
      setIsConfirmed(true);
    } catch {
      setError(
        operation === 'create'
          ? translate('createError')
          : translate('renameError'),
      );
    } finally {
      setIsPending(false);
    }
  }, [
    confirmationCta?.action,
    confirmationCta?.payload,
    description,
    isConfirmed,
    isPending,
    label,
    onUiAction,
    operation,
    slug,
    sourceActionId,
    translate,
  ]);

  if (isConfirmed) {
    return (
      <div
        className="my-2 bg-background-secondary p-4 shadow-border"
        role="status"
      >
        <div className="flex items-center gap-2 text-success">
          <CircleCheck className="size-5" aria-hidden />
          <span className="text-sm font-medium">
            {operation === 'create'
              ? translate('created', { label: label.trim() })
              : translate('renamed', { label: label.trim() })}
          </span>
        </div>
      </div>
    );
  }

  const actionLabel =
    operation === 'create'
      ? translate('createBrand')
      : translate('renameBrand');

  return (
    <div className="my-2 bg-background-secondary p-4 shadow-border">
      <div className="mb-3 flex items-start gap-2">
        <Building2
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {action.title ||
              (operation === 'create'
                ? translate('confirmCreateTitle')
                : translate('confirmRenameTitle'))}
          </h3>
          <p className="mt-0.5 text-2xs font-medium uppercase tracking-wider text-warning">
            {translate('awaitingConfirmation')}
          </p>
        </div>
      </div>

      {action.description ? (
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          {action.description}
        </p>
      ) : null}

      {operation === 'rename' && readString(currentIdentity.label) ? (
        <p className="mb-3 bg-background-tertiary px-3 py-2 text-xs text-muted-foreground">
          {translate('currentBrand')}{' '}
          <span className="font-medium text-foreground">
            {readString(currentIdentity.label)}
          </span>
          {readString(currentIdentity.slug)
            ? ` (${readString(currentIdentity.slug)})`
            : null}
        </p>
      ) : null}

      <div className="grid gap-3">
        <div>
          <label
            className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground"
            htmlFor={labelInputId}
          >
            {translate('labelField')}
          </label>
          <Input
            id={labelInputId}
            value={label}
            onChange={handleLabelChange}
            isDisabled={!isInteractive || isPending}
            placeholder={translate('labelPlaceholder')}
          />
        </div>

        <div>
          <label
            className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground"
            htmlFor={slugInputId}
          >
            {translate('slugField')}
          </label>
          <Input
            id={slugInputId}
            value={slug}
            onChange={handleSlugChange}
            isDisabled={!isInteractive || isPending}
            placeholder={translate('slugPlaceholder')}
          />
        </div>

        {operation === 'create' ? (
          <div>
            <label
              className="mb-1 block text-2xs font-medium uppercase tracking-wider text-muted-foreground"
              htmlFor={descriptionInputId}
            >
              {translate('descriptionField')}
            </label>
            <Textarea
              id={descriptionInputId}
              value={description}
              onChange={handleDescriptionChange}
              isDisabled={!isInteractive || isPending}
              rows={3}
              placeholder={translate('descriptionPlaceholder')}
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {confirmationCta?.action ? (
        <Button
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
          className="mt-4 w-full justify-center"
          icon={<Building2 className="size-4" />}
          isDisabled={
            !isInteractive || !label.trim() || !slug.trim() || isPending
          }
          isLoading={isPending}
          onClick={() => {
            void handleConfirm();
          }}
        >
          {isPending
            ? operation === 'create'
              ? translate('creating')
              : translate('renaming')
            : (confirmationCta.label ?? actionLabel)}
        </Button>
      ) : null}
    </div>
  );
}
