'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  HarnessProfileScope,
  ICreateHarnessProfilePayload,
  IHarnessProfile,
} from '@genfeedai/interfaces';
import { HarnessProfilesService } from '@genfeedai/services/ai/harness-profiles.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import Card from '@ui/card/Card';
import Loading from '@ui/loading/default/Loading';
import { Badge } from '@ui/primitives/badge';
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
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const HARNESS_PROFILE_SCOPES = [
  'brand',
  'channel',
  'company',
  'founder',
] as const satisfies readonly HarnessProfileScope[];
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

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinLines(value: string[] | undefined): string {
  return (value ?? []).join('\n');
}

function isHarnessProfileScope(value: string): value is HarnessProfileScope {
  return HARNESS_PROFILE_SCOPES.includes(value as HarnessProfileScope);
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
  const { brand, brandId, hasBrandId, isLoading } = useBrandDetail();
  const getHarnessProfilesService = useAuthedService((token: string) =>
    HarnessProfilesService.getInstance(token),
  );

  const [profile, setProfile] = useState<IHarnessProfile | null>(null);
  const [draft, setDraft] = useState<ICreateHarnessProfilePayload>(() =>
    createDraft('', 'Brand'),
  );
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!brandId || !brand) {
      setIsFetching(false);
      return;
    }

    const controller = new AbortController();
    const brandLabel = brand.label;

    async function loadProfile() {
      setIsFetching(true);
      try {
        const service = await getHarnessProfilesService();
        const profiles = await service.findForBrand(brandId);
        const activeProfile =
          profiles.find((item) => item.isDefault && item.status === 'active') ??
          profiles[0] ??
          null;

        if (controller.signal.aborted) {
          return;
        }

        setProfile(activeProfile as IHarnessProfile | null);
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
  }, [brand, brandId, getHarnessProfilesService]);

  const updateDraft = useCallback(
    <Key extends keyof IHarnessProfile>(
      key: Key,
      value: IHarnessProfile[Key],
    ) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const updateScope = useCallback(
    (value: string) => {
      if (isHarnessProfileScope(value)) {
        updateDraft('scope', value);
      }
    },
    [updateDraft],
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
        status: draft.status ?? 'active',
      };
      const saved = profile?.id
        ? await service.updateProfile(profile.id, payload)
        : await service.createForBrand(payload);

      setProfile(saved as IHarnessProfile);
      setDraft(createDraft(brandId, brand?.label ?? 'Brand', saved));
      toast.success('Harness profile saved.');
    } catch (error) {
      logger.error('SAVE /harness-profiles failed', error);
      toast.error('Unable to save harness profile.');
    } finally {
      setIsSaving(false);
    }
  }, [brand?.label, brandId, draft, getHarnessProfilesService, profile?.id]);

  if (!hasBrandId || isLoading || isFetching) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">Brand not found.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-background/80 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                Harness Profile
              </h1>
              <Badge variant="outline">v1.1</Badge>
              <Badge
                variant={draft.status === 'active' ? 'success' : 'warning'}
              >
                {draft.status ?? 'active'}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Structure-first voice rules injected into content generation. Keep
              it concrete: hook, one-liners, transitions, proof, conclusion.
            </p>
          </div>
          <Button
            disabled={isSaving}
            onClick={handleSave}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
          >
            {isSaving ? 'Saving...' : 'Save harness'}
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="harness-label">Label</Label>
                <Input
                  id="harness-label"
                  onChange={(event) => updateDraft('label', event.target.value)}
                  value={draft.label}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="harness-scope">Scope</Label>
                <Select
                  onValueChange={updateScope}
                  value={draft.scope ?? 'brand'}
                >
                  <SelectTrigger id="harness-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HARNESS_PROFILE_SCOPES.map((scope) => (
                      <SelectItem key={scope} value={scope}>
                        {scope}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="harness-description">Description</Label>
                <Input
                  id="harness-description"
                  onChange={(event) =>
                    updateDraft('description', event.target.value)
                  }
                  placeholder="What this profile is for"
                  value={draft.description ?? ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="harness-platforms">Platforms</Label>
                <Textarea
                  id="harness-platforms"
                  maxHeight={180}
                  onChange={(event) =>
                    updateDraft('platforms', splitLines(event.target.value))
                  }
                  value={joinLines(draft.platforms)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="harness-audience">ICP / Audience</Label>
                <Textarea
                  id="harness-audience"
                  maxHeight={180}
                  onChange={(event) =>
                    updateDraft('audience', splitLines(event.target.value))
                  }
                  value={joinLines(draft.audience)}
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold">Voice</h2>
              <p className="text-sm text-muted-foreground">
                The attitude and vocabulary the model should carry into every
                draft.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(
                ['tone', 'style', 'stance', 'aggression', 'sarcasm'] as const
              ).map((key) => (
                <div className="space-y-2" key={key}>
                  <Label htmlFor={`harness-${key}`}>{key}</Label>
                  <Input
                    id={`harness-${key}`}
                    onChange={(event) => updateVoice(key, event.target.value)}
                    value={(draft.voice?.[key] as string | undefined) ?? ''}
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="harness-vocabulary">Vocabulary</Label>
                <Textarea
                  id="harness-vocabulary"
                  maxHeight={180}
                  onChange={(event) =>
                    updateVoice('vocabulary', splitLines(event.target.value))
                  }
                  value={joinLines(draft.voice?.vocabulary)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="harness-banned">Banned phrases</Label>
                <Textarea
                  id="harness-banned"
                  maxHeight={180}
                  onChange={(event) =>
                    updateVoice('bannedPhrases', splitLines(event.target.value))
                  }
                  value={joinLines(draft.voice?.bannedPhrases)}
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold">Thesis</h2>
              <p className="text-sm text-muted-foreground">
                The opinion engine. Beliefs, enemies, proof, and what the
                account sells.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {(['beliefs', 'enemies', 'offers', 'proofPoints'] as const).map(
                (key) => (
                  <div className="space-y-2" key={key}>
                    <Label htmlFor={`harness-thesis-${key}`}>{key}</Label>
                    <Textarea
                      id={`harness-thesis-${key}`}
                      maxHeight={220}
                      onChange={(event) =>
                        updateList('thesis', key, event.target.value)
                      }
                      value={joinLines(draft.thesis?.[key])}
                    />
                  </div>
                ),
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold">Structure</h2>
              <p className="text-sm text-muted-foreground">
                Format rules for one-liners, threads, and articles.
              </p>
            </div>
            <div className="space-y-4">
              {(
                [
                  'shortFormSkeleton',
                  'longFormSkeleton',
                  'lineRules',
                  'transitions',
                  'endings',
                ] as const
              ).map((key) => (
                <div className="space-y-2" key={key}>
                  <Label htmlFor={`harness-structure-${key}`}>{key}</Label>
                  <Textarea
                    id={`harness-structure-${key}`}
                    maxHeight={220}
                    onChange={(event) =>
                      updateList('structure', key, event.target.value)
                    }
                    value={joinLines(draft.structure?.[key])}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold">Examples</h2>
              <p className="text-sm text-muted-foreground">
                Paste one example per block. These are injected as reference
                signals, not copied.
              </p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="harness-good">Good examples</Label>
                <Textarea
                  id="harness-good"
                  maxHeight={260}
                  onChange={(event) =>
                    updateList('examples', 'good', event.target.value)
                  }
                  value={joinLines(draft.examples?.good)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="harness-avoid">Anti-examples</Label>
                <Textarea
                  id="harness-avoid"
                  maxHeight={220}
                  onChange={(event) =>
                    updateList('examples', 'avoid', event.target.value)
                  }
                  value={joinLines(draft.examples?.avoid)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="harness-guardrails">Guardrails</Label>
                <Textarea
                  id="harness-guardrails"
                  maxHeight={220}
                  onChange={(event) =>
                    updateDraft('guardrails', splitLines(event.target.value))
                  }
                  value={joinLines(draft.guardrails)}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
