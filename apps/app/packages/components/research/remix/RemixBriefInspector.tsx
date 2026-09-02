'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
} from '@genfeedai/contracts';
import {
  type BrandRemixDraftEdits,
  type BrandRemixReference,
  type BrandRemixRunView,
  generationFidelityModeValues,
  generationReferenceRoleValues,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  AgentArtifactReference,
  IAvatar,
} from '@genfeedai/contracts/interfaces';
import { useAvatarImages } from '@hooks/data/ingredients/use-avatar-images/use-avatar-images';
import type { Voice } from '@models/ingredients/voice.model';
import { useVoiceCatalog } from '@pages/library/voices/hooks/use-voice-catalog';
import { useDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import ContextInspector from '@ui/overlays/context-inspector/ContextInspector';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { Library, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type ReactElement,
  useEffect,
  useMemo,
  useState,
} from 'react';
import LibraryPickerOverlay from '@/features/library-remix/LibraryPickerOverlay';

export type RemixEditorState = {
  aspectRatio: string;
  avatarAssetId: string;
  callToAction: string;
  count: number;
  fidelityMode: BrandRemixRunView['draft']['fidelityMode'];
  hook: string;
  objective: string;
  outputKind: BrandRemixRunView['draft']['output']['kind'];
  references: BrandRemixReference[];
  speechVoiceId: string;
  targetPlatform: BrandRemixRunView['draft']['target']['platform'];
  visualDirection: string;
};

const EMPTY_EDITOR: RemixEditorState = {
  aspectRatio: '9:16',
  avatarAssetId: '',
  callToAction: '',
  count: 1,
  fidelityMode: 'guided',
  hook: '',
  objective: '',
  outputKind: 'video',
  references: [],
  speechVoiceId: '',
  targetPlatform: 'tiktok',
  visualDirection: '',
};

const GENERATION_READY_IDENTITY_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
] as const;
const GENERATION_READY_IDENTITY_STATUS_SET = new Set<string>(
  GENERATION_READY_IDENTITY_STATUSES,
);

function toEditorState(run: BrandRemixRunView): RemixEditorState {
  const identity =
    'avatarAssetId' in run.draft.identity ? run.draft.identity : null;
  return {
    aspectRatio:
      'aspectRatio' in run.draft.output ? run.draft.output.aspectRatio : '9:16',
    avatarAssetId: identity?.avatarAssetId ?? '',
    callToAction: run.draft.intent.callToAction ?? '',
    count: run.draft.output.count,
    fidelityMode: run.draft.fidelityMode,
    hook: run.draft.intent.hook ?? '',
    objective: run.draft.intent.objective,
    outputKind: run.draft.output.kind,
    references: [...run.draft.references],
    speechVoiceId: identity?.speechVoiceId ?? '',
    targetPlatform: run.draft.target.platform,
    visualDirection: run.draft.intent.visualDirection ?? '',
  };
}

export function buildRemixDraftEdits(
  editor: RemixEditorState,
  run: BrandRemixRunView,
): BrandRemixDraftEdits {
  return {
    fidelityMode: editor.fidelityMode,
    ...(editor.outputKind === 'avatar' &&
    editor.avatarAssetId &&
    editor.speechVoiceId
      ? {
          identity: {
            avatarAssetId: editor.avatarAssetId,
            speechVoiceId: editor.speechVoiceId,
          },
        }
      : editor.outputKind !== 'avatar' && 'avatarAssetId' in run.draft.identity
        ? {
            identity: {
              avatarAssetId: null,
              speechVoiceId: null,
            },
          }
        : {}),
    intent: {
      ...(editor.callToAction
        ? { callToAction: editor.callToAction.trim() }
        : {}),
      ...(editor.hook ? { hook: editor.hook.trim() } : {}),
      objective: editor.objective.trim(),
      ...(editor.visualDirection
        ? { visualDirection: editor.visualDirection.trim() }
        : {}),
    },
    output:
      editor.outputKind === 'copy'
        ? { count: editor.count, kind: 'copy' }
        : {
            aspectRatio: editor.aspectRatio,
            count: editor.count,
            kind: editor.outputKind,
            ...(editor.outputKind === 'image'
              ? { durationSeconds: null }
              : 'durationSeconds' in run.draft.output &&
                  run.draft.output.durationSeconds
                ? { durationSeconds: run.draft.output.durationSeconds }
                : {}),
          },
    references: editor.references
      .filter((reference) => reference.source === 'explicit')
      .map((reference) => ({
        assetId: reference.assetId,
        ...(reference.description
          ? { description: reference.description }
          : {}),
        role: reference.role,
      })),
    target:
      run.draft.target.kind === 'paid'
        ? {
            ...run.draft.target,
            platform: editor.targetPlatform as
              | 'google'
              | 'meta'
              | 'tiktok'
              | 'x',
          }
        : {
            ...run.draft.target,
            platform: editor.targetPlatform as
              | 'instagram'
              | 'tiktok'
              | 'youtube',
          },
  };
}

function getReadinessAlertType(
  state: BrandRemixRunView['readiness']['state'],
): AlertCategory {
  if (state === 'blocked') {
    return AlertCategory.ERROR;
  }
  if (state === 'degraded') {
    return AlertCategory.WARNING;
  }
  return AlertCategory.SUCCESS;
}

function formatLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getVoiceName(voice: Voice): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}

function isGenerationReadyAvatar(avatar: IAvatar): boolean {
  return GENERATION_READY_IDENTITY_STATUS_SET.has(String(avatar.status));
}

function isGenerationReadyVoice(voice: Voice): boolean {
  return (
    GENERATION_READY_IDENTITY_STATUS_SET.has(String(voice.status)) &&
    Boolean(
      voice.isCloned ||
        voice.externalVoiceId?.trim() ||
        voice.sampleAudioUrl?.trim(),
    )
  );
}

function resolveReferenceId(reference: AgentArtifactReference): string | null {
  if (
    (reference.kind === 'asset' || reference.kind === 'ingredient') &&
    'recordId' in reference
  ) {
    return reference.recordId;
  }
  return null;
}

type AvatarIdentityFieldsProps = {
  avatarAssetId: string;
  onAvatarAssetIdChange: (avatarAssetId: string) => void;
  onSpeechVoiceIdChange: (speechVoiceId: string) => void;
  speechVoiceId: string;
};

function AvatarIdentityFields({
  avatarAssetId,
  onAvatarAssetIdChange,
  onSpeechVoiceIdChange,
  speechVoiceId,
}: AvatarIdentityFieldsProps): ReactElement {
  const translate = useTranslations('pages.remixBrief');
  const { brandId, organizationId } = useBrand();
  const { avatars, isLoading: isLoadingAvatars } =
    useAvatarImages(organizationId);
  const { isLoading: isLoadingVoices, voices } = useVoiceCatalog({
    isActive: true,
    status: [...GENERATION_READY_IDENTITY_STATUSES],
  });
  const readyAvatars = useMemo(
    () =>
      avatars.filter(
        (avatar) =>
          isGenerationReadyAvatar(avatar) &&
          (avatar.brandId == null || avatar.brandId === brandId),
      ),
    [avatars, brandId],
  );
  const readyVoices = useMemo(
    () =>
      voices.filter(
        (voice) =>
          isGenerationReadyVoice(voice) &&
          (voice.brandId == null || voice.brandId === brandId),
      ),
    [brandId, voices],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Select
        disabled={isLoadingAvatars}
        onValueChange={(value) =>
          onAvatarAssetIdChange(value === 'none' ? '' : value)
        }
        value={avatarAssetId || 'none'}
      >
        <SelectTrigger aria-label="Avatar identity">
          <SelectValue
            placeholder={
              isLoadingAvatars
                ? 'Loading avatars…'
                : translate('identity.chooseAvatar')
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            {translate('identity.chooseAvatar')}
          </SelectItem>
          {readyAvatars.map((avatar) => (
            <SelectItem key={avatar.id} value={avatar.id}>
              {getIngredientDisplayLabel(avatar)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        disabled={isLoadingVoices}
        onValueChange={(value) =>
          onSpeechVoiceIdChange(value === 'none' ? '' : value)
        }
        value={speechVoiceId || 'none'}
      >
        <SelectTrigger aria-label="Voice identity">
          <SelectValue
            placeholder={
              isLoadingVoices
                ? 'Loading voices…'
                : translate('identity.chooseVoice')
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            {translate('identity.chooseVoice')}
          </SelectItem>
          {readyVoices.map((voice) => (
            <SelectItem key={voice.id} value={voice.id}>
              {getVoiceName(voice)}
              {voice.provider ? ` (${voice.provider})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function RemixBriefInspector(): ReactElement {
  const translate = useTranslations('pages.remixBrief');
  const { close, confirm, error, isOpen, retry, run, status } =
    useDiscoveryRemix();
  const [editor, setEditor] = useState<RemixEditorState>(EMPTY_EDITOR);
  const [isPickingReference, setIsPickingReference] = useState(false);
  const [referenceRole, setReferenceRole] =
    useState<BrandRemixReference['role']>('style');

  useEffect(() => {
    if (!run) {
      setEditor(EMPTY_EDITOR);
      setIsPickingReference(false);
      return;
    }

    setEditor(toEditorState(run));
    setIsPickingReference(false);
  }, [run]);

  const patternEntries = useMemo(
    () =>
      run
        ? Object.entries(run.sourceSnapshot.pattern).filter(
            (entry): entry is [string, string] => Boolean(entry[1]),
          )
        : [],
    [run],
  );
  const isSaving = status === 'saving';
  const isAvatarIdentityComplete =
    editor.outputKind !== 'avatar' ||
    Boolean(editor.avatarAssetId && editor.speechVoiceId);
  const canContinue = Boolean(
    run && editor.objective.trim() && !isSaving && isAvatarIdentityComplete,
  );

  const addReference = (reference: AgentArtifactReference) => {
    const assetId = resolveReferenceId(reference);
    if (!assetId) {
      return;
    }

    setEditor((current) => ({
      ...current,
      references: [
        ...current.references.filter(
          (candidate) => candidate.assetId !== assetId,
        ),
        { assetId, role: referenceRole, source: 'explicit' },
      ],
    }));
    setIsPickingReference(false);
  };

  const footer = run ? (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <p className="text-xs text-muted-foreground">
        {translate('recipeRevision', {
          recipeVersion: run.recipeVersion,
          revision: run.revision,
        })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          label="Cancel"
          onClick={close}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        />
        <Button
          isDisabled={!canContinue}
          isLoading={isSaving}
          label="Continue to Studio"
          onClick={() => {
            void confirm(buildRemixDraftEdits(editor, run));
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
        />
      </div>
    </div>
  ) : null;

  return (
    <ContextInspector
      bodyClassName="p-5"
      description="Keep the winning pattern. Replace the execution with your brand, assets, and identity."
      footer={footer}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      title={run ? `Remix for ${run.brand.name}` : 'Prepare on-brand remix'}
      width="lg"
    >
      {status === 'preparing' ? (
        <div
          aria-live="polite"
          className="gen-shell-empty-state p-6"
          role="status"
        >
          <p className="text-sm font-medium text-foreground">
            {translate('loading.title')}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {translate('loading.description')}
          </p>
        </div>
      ) : null}

      {error ? (
        <Alert type={AlertCategory.ERROR}>
          <div className="space-y-1">
            <p className="font-medium">{translate('errors.title')}</p>
            <p className="text-xs">{error}</p>
            {!run ? (
              <div className="flex gap-2 pt-2">
                <Button
                  label="Retry"
                  onClick={() => {
                    void retry();
                  }}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
                <Button
                  label="Close"
                  onClick={close}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                />
              </div>
            ) : null}
          </div>
        </Alert>
      ) : null}

      {run ? (
        <div className="space-y-6">
          <section className="space-y-3 border-b border-border pb-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="ghost">
                {formatLabel(run.sourceSnapshot.platform)}
              </Badge>
              <Badge variant="secondary">
                {formatLabel(run.brand.contextMode)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {run.sourceSnapshot.title}
              </span>
            </div>
            <div>
              <p className="gen-label-sm text-muted-foreground">
                {translate('source.patternTitle')}
              </p>
              <dl className="mt-2 space-y-2">
                {patternEntries.map(([key, value]) => (
                  <div
                    className="grid grid-cols-[7rem_1fr] gap-3 text-sm"
                    key={key}
                  >
                    <dt className="text-muted-foreground">
                      {formatLabel(key)}
                    </dt>
                    <dd className="text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <Alert type={getReadinessAlertType(run.readiness.state)}>
            <div className="space-y-2">
              <p className="font-medium">{formatLabel(run.readiness.state)}</p>
              {run.readiness.issues.length ? (
                <ul className="space-y-1 text-xs">
                  {run.readiness.issues.map((issue) => (
                    <li key={`${issue.code}:${issue.field}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs">
                  {translate('readiness.readyDescription')}
                </p>
              )}
            </div>
          </Alert>

          <section className="space-y-4 border-b border-border pb-6">
            <div>
              <Label htmlFor="remix-objective">
                {editor.outputKind === 'avatar'
                  ? 'Spoken script'
                  : 'Creative objective'}
              </Label>
              {editor.outputKind === 'avatar' ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  {translate('intent.spokenScriptHelp')}
                </p>
              ) : null}
              <Textarea
                id="remix-objective"
                maxHeight={220}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setEditor((current) => ({
                    ...current,
                    objective: event.target.value,
                  }))
                }
                rows={4}
                value={editor.objective}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Hook"
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    hook: event.target.value,
                  }))
                }
                value={editor.hook}
              />
              <Input
                label="Call to action"
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    callToAction: event.target.value,
                  }))
                }
                value={editor.callToAction}
              />
            </div>
            <Input
              label="Visual direction"
              onChange={(event) =>
                setEditor((current) => ({
                  ...current,
                  visualDirection: event.target.value,
                }))
              }
              value={editor.visualDirection}
            />
          </section>

          <section className="space-y-4 border-b border-border pb-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {translate('output.title')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {translate('output.reviewRequired', {
                    target: formatLabel(run.draft.target.kind),
                  })}
                </p>
              </div>
              <Badge variant="ghost">
                {editor.count}
                {editor.outputKind === 'copy'
                  ? null
                  : ` × ${editor.aspectRatio}`}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {translate('reviewPolicy')}
            </p>
            <div className="grid gap-3 sm:grid-cols-4">
              <Select
                onValueChange={(value) =>
                  setEditor((current) => ({
                    ...current,
                    targetPlatform: value as RemixEditorState['targetPlatform'],
                  }))
                }
                value={editor.targetPlatform}
              >
                <SelectTrigger aria-label="Target platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(run.draft.target.kind === 'paid'
                    ? ['meta', 'google', 'tiktok', 'x']
                    : ['tiktok', 'instagram', 'youtube']
                  ).map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {formatLabel(platform)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                onValueChange={(value) =>
                  setEditor((current) => ({
                    ...current,
                    outputKind: value as RemixEditorState['outputKind'],
                  }))
                }
                value={editor.outputKind}
              >
                <SelectTrigger aria-label="Output type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copy">
                    {translate('output.types.copy')}
                  </SelectItem>
                  <SelectItem value="image">
                    {translate('output.types.image')}
                  </SelectItem>
                  <SelectItem value="video">
                    {translate('output.types.video')}
                  </SelectItem>
                  <SelectItem value="avatar">
                    {translate('output.types.avatar')}
                  </SelectItem>
                </SelectContent>
              </Select>
              {editor.outputKind === 'copy' ? null : (
                <Select
                  onValueChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      aspectRatio: value,
                    }))
                  }
                  value={editor.aspectRatio}
                >
                  <SelectTrigger aria-label="Aspect ratio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['1:1', '4:5', '9:16', '16:9'].map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ratio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select
                onValueChange={(value) =>
                  setEditor((current) => ({
                    ...current,
                    count: Number(value),
                  }))
                }
                value={String(editor.count)}
              >
                <SelectTrigger aria-label="Number of variations">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {translate(
                        count === 1
                          ? 'output.variationCountOne'
                          : 'output.variationCountMany',
                        { count },
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div>
                <Label htmlFor="remix-fidelity">
                  {translate('output.fidelityLabel')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {translate('output.fidelityHelp')}
                </p>
              </div>
              <Select
                onValueChange={(value) =>
                  setEditor((current) => ({
                    ...current,
                    fidelityMode: value as RemixEditorState['fidelityMode'],
                  }))
                }
                value={editor.fidelityMode}
              >
                <SelectTrigger
                  aria-label={translate('output.fidelityLabel')}
                  id="remix-fidelity"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {generationFidelityModeValues.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {formatLabel(mode)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editor.outputKind === 'avatar' ? (
              <div className="space-y-3 border-t border-border pt-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {translate('identity.title')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {translate('identity.help')}
                  </p>
                </div>
                <AvatarIdentityFields
                  avatarAssetId={editor.avatarAssetId}
                  onAvatarAssetIdChange={(avatarAssetId) =>
                    setEditor((current) => ({
                      ...current,
                      avatarAssetId,
                    }))
                  }
                  onSpeechVoiceIdChange={(speechVoiceId) =>
                    setEditor((current) => ({
                      ...current,
                      speechVoiceId,
                    }))
                  }
                  speechVoiceId={editor.speechVoiceId}
                />
                {!isAvatarIdentityComplete ? (
                  <p className="text-xs text-warning">
                    {translate('identity.incomplete')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {translate('references.title')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {translate('references.help')}
                </p>
              </div>
              <Button
                icon={<Library className="size-4" />}
                label="Add Library asset"
                onClick={() => setIsPickingReference((current) => !current)}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            </div>

            {editor.references.length ? (
              <div className="divide-y divide-border border-y border-border">
                {editor.references.map((reference) => (
                  <div
                    className="flex items-center justify-between gap-3 py-3"
                    key={`${reference.assetId}:${reference.role}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">
                        {reference.assetId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatLabel(reference.role)} ·{' '}
                        {formatLabel(reference.source)}
                      </p>
                    </div>
                    {reference.source === 'explicit' ? (
                      <Button
                        ariaLabel={`Remove ${reference.assetId}`}
                        icon={<Trash2 className="size-4" />}
                        onClick={() =>
                          setEditor((current) => ({
                            ...current,
                            references: current.references.filter(
                              (candidate) =>
                                candidate.assetId !== reference.assetId,
                            ),
                          }))
                        }
                        size={ButtonSize.ICON}
                        variant={ButtonVariant.GHOST}
                        withWrapper={false}
                      />
                    ) : (
                      <Badge variant="ghost">
                        {translate('references.managedByBrand')}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="gen-shell-empty-state p-4 text-xs text-muted-foreground">
                {translate('references.empty')}
              </div>
            )}

            {isPickingReference ? (
              <div className="overflow-hidden border border-border bg-background">
                <div className="flex items-center gap-3 border-b border-border p-3">
                  <Label htmlFor="remix-reference-role">
                    {translate('references.roleLabel')}
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      setReferenceRole(value as BrandRemixReference['role'])
                    }
                    value={referenceRole}
                  >
                    <SelectTrigger
                      aria-label="Reference role"
                      className="w-44"
                      id="remix-reference-role"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {generationReferenceRoleValues.map((role) => (
                        <SelectItem key={role} value={role}>
                          {formatLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <LibraryPickerOverlay onSelect={addReference} />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </ContextInspector>
  );
}
