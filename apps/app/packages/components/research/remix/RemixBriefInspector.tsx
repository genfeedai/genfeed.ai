'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  IngredientStatus,
} from '@genfeedai/contracts';
import {
  type BrandRemixDraftEdits,
  BrandRemixOrganicPlatform,
  type BrandRemixReference,
  type BrandRemixRunView,
  brandRemixAdPlatformValues,
  brandRemixOrganicPlatformValues,
  generationFidelityModeValues,
  generationReferenceRoleValues,
  isBrandRemixAdPlatform,
  isBrandRemixOrganicPlatform,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  AgentArtifactReference,
  IAvatar,
} from '@genfeedai/contracts/interfaces';
import { useCampaignAccounts } from '@hooks/data/campaigns/use-campaign-accounts';
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
import { getIngredientDisplayLabel } from '@utils/media/ingredient-type.util';
import { Library, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import LibraryPickerOverlay from '@/features/library-remix/LibraryPickerOverlay';
import RemixConceptFields, {
  type RemixStoryboardDraft,
} from './RemixConceptFields';

export type RemixEditorState = {
  angle: string;
  aspectRatio: string;
  avatarAssetId: string;
  callToAction: string;
  count: number;
  credentialId: string;
  fidelityMode: BrandRemixRunView['draft']['fidelityMode'];
  hook: string;
  objective: string;
  outputKind: BrandRemixRunView['draft']['output']['kind'];
  references: BrandRemixReference[];
  speechVoiceId: string;
  storyboard: RemixStoryboardDraft[];
  targetPlatform: BrandRemixRunView['draft']['target']['platform'];
  visualDirection: string;
};

const EMPTY_EDITOR: RemixEditorState = {
  angle: '',
  aspectRatio: '9:16',
  avatarAssetId: '',
  callToAction: '',
  count: 1,
  credentialId: '',
  fidelityMode: 'guided',
  hook: '',
  objective: '',
  outputKind: 'video',
  references: [],
  speechVoiceId: '',
  storyboard: [],
  targetPlatform: BrandRemixOrganicPlatform.TIKTOK,
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
    angle: run.concept?.angle ?? run.draft.intent.angle ?? '',
    aspectRatio:
      'aspectRatio' in run.draft.output ? run.draft.output.aspectRatio : '9:16',
    avatarAssetId: identity?.avatarAssetId ?? '',
    callToAction: run.draft.intent.callToAction ?? '',
    count: run.draft.output.count,
    credentialId: run.draft.target.credentialId ?? '',
    fidelityMode: run.draft.fidelityMode,
    hook: run.concept?.hook ?? run.draft.intent.hook ?? '',
    objective: run.concept?.script ?? run.draft.intent.objective,
    outputKind: run.draft.output.kind,
    references: [...run.draft.references],
    speechVoiceId: identity?.speechVoiceId ?? '',
    storyboard: (run.concept?.storyboard ?? []).map((scene) => ({
      ...(scene.durationSeconds !== undefined
        ? { durationSeconds: scene.durationSeconds }
        : {}),
      id: scene.id,
      identity: scene.identity,
      sourceObservation: scene.sourceObservation,
      key: scene.id ?? `saved-${scene.ordinal}`,
      narration: scene.narration ?? '',
      visualIntent: scene.visualIntent,
    })),
    targetPlatform: run.draft.target.platform,
    visualDirection: run.draft.intent.visualDirection ?? '',
  };
}

function optionalConceptText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function conceptStoryboard(
  storyboard: RemixStoryboardDraft[],
): NonNullable<BrandRemixDraftEdits['concept']>['storyboard'] {
  return storyboard.flatMap((scene, index) => {
    const visualIntent = scene.visualIntent.trim();
    if (!visualIntent) return [];
    const narration = scene.narration.trim();
    return [
      {
        id: scene.id,
        identity: scene.identity,
        sourceObservation: scene.sourceObservation,
        ordinal: index + 1,
        visualIntent,
        ...(narration ? { narration } : {}),
        ...(scene.durationSeconds !== undefined &&
        scene.durationSeconds > 0 &&
        scene.durationSeconds <= 60
          ? { durationSeconds: scene.durationSeconds }
          : {}),
      },
    ];
  });
}

function isEditorConceptComplete(editor: RemixEditorState): boolean {
  return Boolean(
    editor.angle.trim() &&
      editor.hook.trim() &&
      editor.objective.trim() &&
      editor.storyboard.some((scene) => scene.visualIntent.trim()),
  );
}

function hasIdentityEdits(
  editor: RemixEditorState,
  run: BrandRemixRunView,
): boolean {
  const identity =
    'avatarAssetId' in run.draft.identity ? run.draft.identity : null;
  return (
    editor.avatarAssetId !== (identity?.avatarAssetId ?? '') ||
    editor.speechVoiceId !== (identity?.speechVoiceId ?? '')
  );
}

function getDestinationPlatform(
  platform: RemixEditorState['targetPlatform'],
  kind: BrandRemixRunView['draft']['target']['kind'],
): CredentialPlatform {
  const platforms: Record<
    RemixEditorState['targetPlatform'],
    CredentialPlatform
  > = {
    google: CredentialPlatform.GOOGLE_ADS,
    instagram: CredentialPlatform.INSTAGRAM,
    meta: CredentialPlatform.FACEBOOK,
    tiktok: CredentialPlatform.TIKTOK,
    x: kind === 'paid' ? CredentialPlatform.X_ADS : CredentialPlatform.TWITTER,
    youtube: CredentialPlatform.YOUTUBE,
  };
  return platforms[platform];
}

export function buildRemixDraftEdits(
  editor: RemixEditorState,
  run: BrandRemixRunView,
): BrandRemixDraftEdits {
  const { credentialId: _credentialId, ...target } = run.draft.target;
  const destination = editor.credentialId
    ? { credentialId: editor.credentialId }
    : {};
  const storyboard = conceptStoryboard(editor.storyboard);
  return {
    concept: {
      angle: optionalConceptText(editor.angle),
      hook: optionalConceptText(editor.hook),
      script: optionalConceptText(editor.objective),
      ...(storyboard ? { storyboard } : {}),
    },
    fidelityMode: editor.fidelityMode,
    ...(editor.outputKind === 'avatar' &&
    hasIdentityEdits(editor, run) &&
    editor.avatarAssetId &&
    editor.speechVoiceId
      ? {
          identity: {
            avatarAssetId: editor.avatarAssetId,
            speechVoiceId: editor.speechVoiceId,
          },
        }
      : editor.outputKind !== 'avatar' &&
          run.draft.output.kind === 'avatar' &&
          'avatarAssetId' in run.draft.identity
        ? {
            identity: {
              avatarAssetId: null,
              speechVoiceId: null,
            },
          }
        : {}),
    intent: {
      ...(editor.angle.trim() ? { angle: editor.angle.trim() } : {}),
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
      target.kind === 'paid'
        ? {
            ...target,
            ...destination,
            platform: isBrandRemixAdPlatform(editor.targetPlatform)
              ? editor.targetPlatform
              : target.platform,
          }
        : {
            ...target,
            ...destination,
            platform: isBrandRemixOrganicPlatform(editor.targetPlatform)
              ? editor.targetPlatform
              : target.platform,
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
          isGenerationReadyAvatar(avatar) && avatar.brandId === brandId,
      ),
    [avatars, brandId],
  );
  const readyVoices = useMemo(
    () =>
      voices.filter(
        (voice) => isGenerationReadyVoice(voice) && voice.brandId === brandId,
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
        <SelectTrigger aria-label={translate('identity.avatarLabel')}>
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
        <SelectTrigger aria-label={translate('identity.voiceLabel')}>
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
  const { close, confirm, error, generate, isOpen, retry, run, status } =
    useDiscoveryRemix();
  const { brandId } = useBrand();
  const {
    accounts,
    isPending: isLoadingAccounts,
    isError: isAccountsError,
  } = useCampaignAccounts(brandId);
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
  const destinationAccounts = accounts.filter(
    (account) =>
      account.brandId === brandId &&
      account.isConnected &&
      !account.isDeleted &&
      account.platform ===
        getDestinationPlatform(
          editor.targetPlatform,
          run?.draft.target.kind ?? 'organic',
        ),
  );
  const isSaving = status === 'saving' || status === 'generating';
  const isAvatarIdentityComplete =
    editor.outputKind !== 'avatar' ||
    Boolean(editor.avatarAssetId && editor.speechVoiceId) ||
    Boolean(
      editor.credentialId &&
        run &&
        editor.credentialId !== run.draft.target.credentialId &&
        run.draft.identitySource !== undefined &&
        run.draft.identitySource !== 'explicit' &&
        !hasIdentityEdits(editor, run),
    );
  const canContinue = Boolean(
    run && editor.objective.trim() && !isSaving && isAvatarIdentityComplete,
  );
  const canGenerate = Boolean(
    canContinue &&
      run?.readiness.state !== 'blocked' &&
      isEditorConceptComplete(editor),
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
          label={translate('actions.cancel')}
          onClick={close}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        />
        <Button
          isDisabled={!canContinue}
          isLoading={status === 'saving'}
          label={translate('actions.saveIdea')}
          onClick={() => {
            void confirm(buildRemixDraftEdits(editor, run));
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        <Button
          isDisabled={!canGenerate}
          isLoading={status === 'generating'}
          label={translate('actions.generate')}
          onClick={() => {
            void generate(buildRemixDraftEdits(editor, run));
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
      description={translate('description')}
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
                  label={translate('actions.retry')}
                  onClick={() => {
                    void retry();
                  }}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
                <Button
                  label={translate('actions.close')}
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

          <RemixConceptFields
            angle={editor.angle}
            hook={editor.hook}
            onAngleChange={(angle) =>
              setEditor((current) => ({ ...current, angle }))
            }
            onHookChange={(hook) =>
              setEditor((current) => ({ ...current, hook }))
            }
            onScriptChange={(objective) =>
              setEditor((current) => ({ ...current, objective }))
            }
            onStoryboardChange={(storyboard) =>
              setEditor((current) => ({ ...current, storyboard }))
            }
            script={editor.objective}
            scriptHelp={
              editor.outputKind === 'avatar'
                ? translate('intent.spokenScriptHelp')
                : undefined
            }
            storyboard={editor.storyboard}
          />
          <section className="space-y-4 border-b border-border pb-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label={translate('intent.callToAction')}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    callToAction: event.target.value,
                  }))
                }
                value={editor.callToAction}
              />
              <Input
                label={translate('intent.visualDirection')}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    visualDirection: event.target.value,
                  }))
                }
                value={editor.visualDirection}
              />
            </div>
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
                onValueChange={(value) => {
                  const isPaidTarget = run.draft.target.kind === 'paid';
                  if (isPaidTarget) {
                    if (!isBrandRemixAdPlatform(value)) {
                      return;
                    }
                    setEditor((current) => ({
                      ...current,
                      credentialId: '',
                      targetPlatform: value,
                    }));
                    return;
                  }
                  if (!isBrandRemixOrganicPlatform(value)) {
                    return;
                  }
                  setEditor((current) => ({
                    ...current,
                    credentialId: '',
                    targetPlatform: value,
                  }));
                }}
                value={editor.targetPlatform}
              >
                <SelectTrigger aria-label={translate('output.targetPlatform')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(run.draft.target.kind === 'paid'
                    ? brandRemixAdPlatformValues
                    : brandRemixOrganicPlatformValues
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
                <SelectTrigger aria-label={translate('output.outputType')}>
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
                  <SelectTrigger aria-label={translate('output.aspectRatio')}>
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
                <SelectTrigger aria-label={translate('output.variationCount')}>
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
              <Label htmlFor="remix-destination">
                {translate('destination.label')}
              </Label>
              <Select
                disabled={isLoadingAccounts}
                value={editor.credentialId || 'brand-defaults'}
                onValueChange={(value) =>
                  setEditor((current) => ({
                    ...current,
                    credentialId: value === 'brand-defaults' ? '' : value,
                  }))
                }
              >
                <SelectTrigger
                  id="remix-destination"
                  aria-label={translate('destination.label')}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="brand-defaults">
                    {translate('destination.brandDefaults')}
                  </SelectItem>
                  {destinationAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.externalHandle ||
                        account.externalName ||
                        account.externalId ||
                        account.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {translate('destination.help')}
              </p>
              {isLoadingAccounts ? (
                <p className="text-xs text-muted-foreground">
                  {translate('destination.loading')}
                </p>
              ) : isAccountsError ? (
                <p className="text-xs text-muted-foreground">
                  {translate('destination.error')}
                </p>
              ) : destinationAccounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {translate('destination.empty')}
                </p>
              ) : null}
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
                label={translate('references.addLibraryAsset')}
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
                      aria-label={translate('references.referenceRole')}
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
