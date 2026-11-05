'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  ICreateHarnessProfilePayload,
  IHarnessProfile,
} from '@genfeedai/contracts/interfaces';
import { HarnessProfilesService } from '@genfeedai/services/ai/harness-profiles.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { SavedProfileRef } from '@/features/settings/props/content-rules.props';
import { useBrandDetail } from '@/hooks/pages/use-brand-detail/use-brand-detail';
import ContentRulesDeliveryTab from './content-rules-delivery-tab';
import ContentRulesExamplesTab from './content-rules-examples-tab';
import ContentRulesIdentityTab from './content-rules-identity-tab';
import ContentRulesPositioningScorecard from './content-rules-positioning-scorecard';
import ContentRulesStructureTab from './content-rules-structure-tab';
import ContentRulesThesisTab from './content-rules-thesis-tab';

const DEFAULT_PLATFORMS = ['x', 'linkedin', 'instagram', 'tiktok'];
const DEFAULT_SHORT_FORM = [
  'Hook',
  'One idea per line',
  'Transition or proof',
  'BAM conclusion',
];
const DEFAULT_LONG_FORM = [
  'Cold opinion',
  'Why it matters',
  'Specific steps or proof',
  'Boom takeaway',
];
const DEFAULT_LINE_RULES = [
  'One line per idea',
  'Straight to the point',
  'No throat clearing',
  'Make transitions obvious',
];

const CONTENT_RULES_TABS = [
  'identity',
  'structure',
  'delivery',
  'thesis',
  'examples',
] as const;

type ContentRulesTabId = (typeof CONTENT_RULES_TABS)[number];

function splitLines(value: string): string[] {
  return value.split('\n').flatMap((line) => {
    const trimmedLine = line.trim();
    return trimmedLine ? [trimmedLine] : [];
  });
}

function harnessProfilesQueryKey(brandId: string) {
  return ['harness-profiles', brandId] as const;
}

/** The profile this page edits: the one last saved here, else the default active one. */
function pickEditedProfile(
  profiles: readonly IHarnessProfile[] | undefined,
  preferredId: string | undefined,
): IHarnessProfile | null {
  if (!profiles) {
    return null;
  }
  return (
    (preferredId
      ? profiles.find((item) => item.id === preferredId)
      : undefined) ??
    profiles.find((item) => item.isDefault && item.status === 'active') ??
    profiles[0] ??
    null
  );
}

function withSavedProfile(
  profiles: IHarnessProfile[] | undefined,
  saved: IHarnessProfile,
): IHarnessProfile[] {
  if (!profiles) {
    return [saved];
  }
  return profiles.some((item) => item.id === saved.id)
    ? profiles.map((item) => (item.id === saved.id ? saved : item))
    : [saved, ...profiles];
}

function createDraft(
  brandId: string,
  label: string,
  existing?: IHarnessProfile | null,
): ICreateHarnessProfilePayload {
  if (existing) {
    return {
      ...existing,
      brandId,
      label: existing.label,
    };
  }

  return {
    audience: ['devs', 'AI builders'],
    brandId,
    examples: {
      avoid: [],
      good: [],
    },
    guardrails: [
      'Avoid generic AI phrasing',
      'Output first, explanation after',
    ],
    handles: {},
    isDefault: true,
    label: `${label} Content rules`,
    platforms: DEFAULT_PLATFORMS,
    profileType: 'harness',
    scope: 'brand',
    status: 'active',
    structure: {
      lineRules: DEFAULT_LINE_RULES,
      longFormSkeleton: DEFAULT_LONG_FORM,
      shortFormSkeleton: DEFAULT_SHORT_FORM,
      transitions: ['The revenue numbers prove it', 'Here is the playbook'],
      endings: ['Own the edge', 'Ship the thing'],
    },
    thesis: {
      beliefs: [],
      enemies: [],
      offers: [],
      proofPoints: [],
    },
    voice: {
      aggression: 'sharp, not sloppy',
      sarcasm: 'dry founder sarcasm when useful',
      stance: '',
      style: 'one-line ideas with clear transitions',
      tone: 'direct',
      vocabulary: [],
    },
  };
}

export default function BrandContentRulesPage() {
  const translate = useTranslations('pages.brandHarnessSettings');
  const receiptTranslate = useTranslations('pages.generationReceipts');
  const { brand, brandId, hasBrandId, isLoading } = useBrandDetail();
  const { href } = useOrgUrl();
  const getHarnessProfilesService = useAuthedService((token: string) =>
    HarnessProfilesService.getInstance(token),
  );

  const queryClient = useQueryClient();
  // The brand's profiles read through React Query, so coming back to the page
  // paints the cached rules at once and refreshes them in the background.
  const profilesQuery = useAuthedQuery<
    HarnessProfilesService,
    IHarnessProfile[]
  >({
    enabled: Boolean(brandId),
    queryFn: (service) => service.findForBrand(brandId),
    queryKey: harnessProfilesQueryKey(brandId),
    service: (token: string) => HarnessProfilesService.getInstance(token),
  });
  const profiles = profilesQuery.data;
  const hasProfiles = profiles !== undefined;
  const { error: loadError } = profilesQuery;

  // The profile last saved here stays the one edited, even when it is not
  // the default active one.
  const [savedProfile, setSavedProfile] = useState<SavedProfileRef | null>(
    null,
  );
  const editedProfile = useMemo(
    () =>
      pickEditedProfile(
        profiles,
        savedProfile?.brandId === brandId ? savedProfile.id : undefined,
      ),
    [brandId, profiles, savedProfile],
  );

  const brandLabel = brand?.label;
  const [activeTab, setActiveTab] = useState<ContentRulesTabId>('identity');
  const [draft, setDraft] = useState<ICreateHarnessProfilePayload>(() =>
    createDraft(brandId, brandLabel ?? 'Brand', editedProfile),
  );
  const [hasEdits, setHasEdits] = useState(false);
  // What the draft was last seeded from. A fresh read re-seeds it only while
  // it is untouched, so a background refresh never wipes what the user is
  // typing; another brand always re-seeds it.
  const [draftSource, setDraftSource] = useState({
    brandId,
    brandLabel,
    editedProfile,
  });
  if (
    draftSource.editedProfile !== editedProfile ||
    draftSource.brandId !== brandId ||
    draftSource.brandLabel !== brandLabel
  ) {
    setDraftSource({ brandId, brandLabel, editedProfile });
    if (draftSource.brandId !== brandId || !hasEdits) {
      setDraft(createDraft(brandId, brandLabel ?? 'Brand', editedProfile));
      setHasEdits(false);
    }
  }
  const [isSaving, setIsSaving] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);

  // A failed background refresh keeps the rules on screen without an alert.
  useEffect(() => {
    if (!loadError || hasProfiles) {
      return;
    }
    logger.error('GET /harness-profiles failed', loadError);
    toast.error('Unable to load content rules.');
  }, [hasProfiles, loadError]);

  const updateDraft = useCallback(
    <Key extends keyof IHarnessProfile>(
      key: Key,
      value: IHarnessProfile[Key],
    ) => {
      setHasEdits(true);
      setDraft((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const updateVoice = useCallback(
    (
      key: keyof NonNullable<IHarnessProfile['voice']>,
      value: string | string[],
    ) => {
      setHasEdits(true);
      setDraft((current) => ({
        ...current,
        voice: {
          ...(current.voice ?? {}),
          [key]: value,
        },
      }));
    },
    [],
  );

  const updateList = useCallback(
    (
      section: 'examples' | 'structure' | 'thesis',
      key: string,
      value: string,
    ) => {
      setHasEdits(true);
      setDraft((current) => ({
        ...current,
        [section]: {
          ...(current[section] ?? {}),
          [key]: splitLines(value),
        },
      }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!brandId) {
      return;
    }

    setIsSaving(true);
    try {
      const service = await getHarnessProfilesService();
      const payload = {
        ...draft,
        brandId,
        isDefault: draft.isDefault ?? true,
        label: draft.label || `${brand?.label ?? 'Brand'} Harness`,
        profileType: 'harness' as const,
        // Brand settings harness is always brand-scoped (channel/founder profiles later).
        scope: 'brand' as const,
        status: draft.status ?? 'active',
      };
      const saved: IHarnessProfile = editedProfile?.id
        ? await service.updateProfile(editedProfile.id, payload)
        : await service.createForBrand(payload);

      // A read still in flight would land the older profiles over this save.
      await queryClient.cancelQueries({
        queryKey: harnessProfilesQueryKey(brandId),
      });
      queryClient.setQueriesData<IHarnessProfile[]>(
        { queryKey: harnessProfilesQueryKey(brandId) },
        (current) => withSavedProfile(current, saved),
      );
      setSavedProfile({ brandId, id: saved.id });
      setDraft(createDraft(brandId, brand?.label ?? 'Brand', saved));
      setHasEdits(false);
      toast.success('Harness profile saved.');
    } catch (error) {
      logger.error('SAVE /harness-profiles failed', error);
      toast.error('Unable to save harness profile.');
    } finally {
      setIsSaving(false);
    }
  }, [
    brand?.label,
    brandId,
    draft,
    editedProfile,
    getHarnessProfilesService,
    queryClient,
  ]);

  const handlePromoteWinners = useCallback(async () => {
    if (!brandId) {
      return;
    }
    setIsPromoting(true);
    try {
      const service = await getHarnessProfilesService();
      const result = await service.promoteWinners({
        brandId,
        limit: 10,
        platform: 'twitter',
      });
      toast.success(
        `Promoted ${result.promoted} winners to content memory (${result.skipped} skipped).`,
      );
    } catch (error) {
      logger.error('POST /harness-profiles/promote-winners failed', error);
      toast.error('Unable to promote winners into content memory.');
    } finally {
      setIsPromoting(false);
    }
  }, [brandId, getHarnessProfilesService]);

  if (!hasBrandId || isLoading || profilesQuery.isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          {translate('brandMissing')}
        </p>
      </Card>
    );
  }

  const tabs = CONTENT_RULES_TABS.map((id) => ({
    id,
    label: translate(`tabs.${id}`),
  }));

  return (
    <Container
      fullWidth
      headerTabs={{
        activeTab,
        fullWidth: false,
        onTabChange: (tab) => setActiveTab(tab as ContentRulesTabId),
        tabs,
      }}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href('/settings/agent/receipts')} className="text-sm">
            {receiptTranslate('open')}
          </Link>
          <Badge variant="outline">
            {translate('badges.scopePrefix', {
              scope: draft.scope ?? 'brand',
            })}
          </Badge>
          <Badge variant={draft.status === 'active' ? 'success' : 'warning'}>
            {draft.status ?? 'active'}
          </Badge>
          <Button
            disabled={isPromoting || isSaving}
            onClick={handlePromoteWinners}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            {isPromoting ? translate('promoting') : translate('promote')}
          </Button>
          <Button
            disabled={isSaving}
            onClick={handleSave}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          >
            {isSaving ? translate('saving') : translate('save')}
          </Button>
        </div>
      }
    >
      {draft.positioning ? (
        <ContentRulesPositioningScorecard
          interviewHref={href('/settings/brand-kit/setup')}
          positioning={draft.positioning}
        />
      ) : null}

      {activeTab === 'identity' ? (
        <ContentRulesIdentityTab
          draft={draft}
          onDraftChange={updateDraft}
          splitLines={splitLines}
        />
      ) : null}

      {activeTab === 'structure' ? (
        <ContentRulesStructureTab draft={draft} onListChange={updateList} />
      ) : null}

      {activeTab === 'delivery' ? (
        <ContentRulesDeliveryTab
          onVoiceChange={updateVoice}
          splitLines={splitLines}
          voice={draft.voice}
        />
      ) : null}

      {activeTab === 'thesis' ? (
        <ContentRulesThesisTab draft={draft} onListChange={updateList} />
      ) : null}

      {activeTab === 'examples' ? (
        <ContentRulesExamplesTab
          draft={draft}
          onDraftChange={updateDraft}
          onListChange={updateList}
          splitLines={splitLines}
        />
      ) : null}
    </Container>
  );
}
