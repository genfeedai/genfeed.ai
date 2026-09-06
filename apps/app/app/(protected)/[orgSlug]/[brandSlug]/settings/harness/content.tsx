'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  ICreateHarnessProfilePayload,
  IHarnessProfile,
} from '@genfeedai/contracts/interfaces';
import { HarnessProfilesService } from '@genfeedai/services/ai/harness-profiles.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import HarnessDeliveryTab from './harness-delivery-tab';
import HarnessExamplesTab from './harness-examples-tab';
import HarnessIdentityTab from './harness-identity-tab';
import HarnessStructureTab from './harness-structure-tab';
import HarnessThesisTab from './harness-thesis-tab';

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

const HARNESS_TABS = [
  'identity',
  'structure',
  'delivery',
  'thesis',
  'examples',
] as const;

type HarnessTabId = (typeof HARNESS_TABS)[number];

function splitLines(value: string): string[] {
  return value.split('\n').flatMap((line) => {
    const trimmedLine = line.trim();
    return trimmedLine ? [trimmedLine] : [];
  });
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
    label: `${label} Harness`,
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

export default function BrandSettingsHarnessPage() {
  const translate = useTranslations('pages.brandHarnessSettings');
  const { brand, brandId, hasBrandId, isLoading } = useBrandDetail();
  const getHarnessProfilesService = useAuthedService((token: string) =>
    HarnessProfilesService.getInstance(token),
  );

  const profileRef = useRef<IHarnessProfile | null>(null);
  const [activeTab, setActiveTab] = useState<HarnessTabId>('identity');
  const [draft, setDraft] = useState<ICreateHarnessProfilePayload>(() =>
    createDraft('', 'Brand'),
  );
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);

  const brandLabel = brand?.label;
  useEffect(() => {
    if (!brandId || brandLabel === undefined) {
      setIsFetching(false);
      return;
    }

    const controller = new AbortController();

    async function loadProfile() {
      setIsFetching(true);
      try {
        if (controller.signal.aborted) {
          return;
        }

        const service = await getHarnessProfilesService();
        const profiles = await service.findForBrand(brandId);
        const activeProfile =
          profiles.find((item) => item.isDefault && item.status === 'active') ??
          profiles[0] ??
          null;

        profileRef.current = activeProfile as IHarnessProfile | null;
        setDraft(createDraft(brandId, brandLabel, activeProfile));
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('GET /harness-profiles failed', error);
          toast.error('Unable to load harness profile.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsFetching(false);
        }
      }
    }

    void loadProfile();

    return () => controller.abort();
  }, [brandLabel, brandId, getHarnessProfilesService]);

  const updateDraft = useCallback(
    <Key extends keyof IHarnessProfile>(
      key: Key,
      value: IHarnessProfile[Key],
    ) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const updateVoice = useCallback(
    (
      key: keyof NonNullable<IHarnessProfile['voice']>,
      value: string | string[],
    ) => {
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
      const saved = profileRef.current?.id
        ? await service.updateProfile(profileRef.current.id, payload)
        : await service.createForBrand(payload);

      profileRef.current = saved as IHarnessProfile;
      setDraft(createDraft(brandId, brand?.label ?? 'Brand', saved));
      toast.success('Harness profile saved.');
    } catch (error) {
      logger.error('SAVE /harness-profiles failed', error);
      toast.error('Unable to save harness profile.');
    } finally {
      setIsSaving(false);
    }
  }, [brand?.label, brandId, draft, getHarnessProfilesService]);

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

  if (!hasBrandId || isLoading || isFetching) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card bodyClassName="gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          {translate('brandMissing')}
        </p>
      </Card>
    );
  }

  const tabs = HARNESS_TABS.map((id) => ({
    id,
    label: translate(`tabs.${id}`),
  }));

  return (
    <Container
      description={translate('description')}
      fullWidth
      headerTabs={{
        activeTab,
        fullWidth: false,
        onTabChange: (tab) => setActiveTab(tab as HarnessTabId),
        tabs,
      }}
      icon={Sparkles}
      label={translate('title')}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {translate('badges.scopePrefix', { scope: draft.scope ?? 'brand' })}
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
      {activeTab === 'identity' ? (
        <HarnessIdentityTab
          draft={draft}
          onDraftChange={updateDraft}
          splitLines={splitLines}
        />
      ) : null}

      {activeTab === 'structure' ? (
        <HarnessStructureTab draft={draft} onListChange={updateList} />
      ) : null}

      {activeTab === 'delivery' ? (
        <HarnessDeliveryTab
          onVoiceChange={updateVoice}
          splitLines={splitLines}
          voice={draft.voice}
        />
      ) : null}

      {activeTab === 'thesis' ? (
        <HarnessThesisTab draft={draft} onListChange={updateList} />
      ) : null}

      {activeTab === 'examples' ? (
        <HarnessExamplesTab
          draft={draft}
          onDraftChange={updateDraft}
          onListChange={updateList}
          splitLines={splitLines}
        />
      ) : null}
    </Container>
  );
}
