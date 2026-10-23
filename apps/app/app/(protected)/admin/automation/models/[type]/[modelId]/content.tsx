'use client';

import ModelPricingDetails from '@app/(protected)/admin/automation/models/[type]/model-pricing-details';
import { ButtonVariant } from '@genfeedai/contracts';
import type {
  AdminModelDetail,
  UpdateModelProviderRouting,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminModelDetailService } from '@services/admin/model-detail.service';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const usd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 10,
  }).format(value);

export default function ModelDetailContent() {
  const t = useTranslations('pages.adminModelDetail');
  const params = useParams<{ type: string; modelId: string }>();
  const [days, setDays] = useState(30);
  const [candidate, setCandidate] = useState('');
  const [modelDraft, setModelDraft] = useState<Pick<
    AdminModelDetail,
    'id' | 'label' | 'description'
  > | null>(null);
  const queryClient = useQueryClient();
  const getService = useAuthedService((token: string) =>
    AdminModelDetailService.getInstance(token),
  );
  const key = ['admin-model-detail', params.modelId, days];
  const {
    data: model,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      (await getService()).detail(params.modelId, days, signal),
    retry: false,
  });
  const update = useMutation({
    mutationFn: async (patch: UpdateModelProviderRouting) =>
      (await getService()).update(params.modelId, patch),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['admin-model-detail', params.modelId],
      }),
  });
  const providerUpdate = useMutation({
    mutationFn: async (input: { provider: string; isActive: boolean }) =>
      (await getService()).setProviderActive(input.provider, input.isActive),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['admin-model-detail'] }),
  });
  const daily = useMemo(() => {
    const points = new Map<
      string,
      { date: string; generations: number; vendorCostUsd: number }
    >();
    for (let index = days - 1; index >= 0; index--) {
      const date = new Date(Date.now() - index * 86400000)
        .toISOString()
        .slice(0, 10);
      points.set(date, { date, generations: 0, vendorCostUsd: 0 });
    }
    for (const point of model?.usage ?? []) {
      const current = points.get(point.date);
      if (current) {
        current.generations += point.generations;
        current.vendorCostUsd += point.vendorCostUsd;
      }
    }
    return [...points.values()];
  }, [model, days]);
  const providers = useMemo(() => {
    const points = new Map<
      string,
      { provider: string; generations: number; vendorCostUsd: number }
    >();
    for (const point of model?.usage ?? []) {
      const current = points.get(point.provider) ?? {
        provider: point.provider,
        generations: 0,
        vendorCostUsd: 0,
      };
      current.generations += point.generations;
      current.vendorCostUsd += point.vendorCostUsd;
      points.set(point.provider, current);
    }
    return [...points.values()];
  }, [model]);
  const busy = update.isPending || providerUpdate.isPending;
  if (isPending)
    return (
      <p className="p-6 text-muted-foreground" role="status">
        {t('loading')}
      </p>
    );
  if (isError || !model)
    return (
      <div className="p-6 space-y-3">
        <p role="alert">{t('loadError')}</p>
        <Button onClick={() => void refetch()}>{t('retry')}</Button>
      </div>
    );
  const draft = modelDraft?.id === model.id ? modelDraft : model;
  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 p-6">
      <header className="space-y-3">
        <Link
          className="text-sm text-muted-foreground hover:text-foreground"
          href={`/admin/automation/models/${params.type}`}
        >
          {t('backToModels')}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{model.label}</h1>
            <p className="text-sm text-muted-foreground">
              {model.key} · {model.category}
            </p>
          </div>
          <Badge>{model.isActive ? t('active') : t('inactive')}</Badge>
        </div>
      </header>
      <section className="space-y-4" aria-labelledby="model-settings">
        <h2 id="model-settings" className="text-lg font-semibold">
          {t('modelSettings')}
        </h2>
        <Form
          spacing="default"
          key={model.id}
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({
              label: draft.label,
              description: draft.description ?? '',
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="model-label">{t('modelName')}</Label>
              <Input
                id="model-label"
                name="label"
                value={draft.label}
                onChange={(event) =>
                  setModelDraft({
                    id: model.id,
                    label: event.target.value,
                    description: draft.description,
                  })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model-description">{t('description')}</Label>
              <Input
                id="model-description"
                name="description"
                value={draft.description ?? ''}
                onChange={(event) =>
                  setModelDraft({
                    id: model.id,
                    label: draft.label,
                    description: event.target.value,
                  })
                }
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>
              {t('saveModel')}
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.SECONDARY}
              disabled={busy}
              onClick={() => update.mutate({ isModelActive: !model.isActive })}
            >
              {model.isActive ? t('deactivateModel') : t('activateModel')}
            </Button>
          </div>
        </Form>
      </section>
      {(update.isError || providerUpdate.isError) && (
        <p role="alert" className="text-destructive">
          {t('saveError')}
        </p>
      )}
      <section className="space-y-4" aria-labelledby="model-routing">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="model-routing" className="text-lg font-semibold">
              {t('providerConnections')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('routingHint')}</p>
          </div>
          <Select
            value={model.pinnedProvider ?? 'automatic'}
            onValueChange={(value) =>
              update.mutate({
                pinnedProvider: value === 'automatic' ? null : value,
              })
            }
            disabled={busy}
          >
            <SelectTrigger className="w-64" aria-label={t('routingProvider')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="automatic">{t('automaticRouting')}</SelectItem>
              {[...new Set(model.offers.map((offer) => offer.provider))].map(
                (provider) => (
                  <SelectItem key={provider} value={provider}>
                    {t('pinProvider', { provider })}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('provider')}</TableHead>
              <TableHead>{t('endpoint')}</TableHead>
              <TableHead>{t('pricing')}</TableHead>
              <TableHead>{t('offer')}</TableHead>
              <TableHead>{t('providerAvailability')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.offers.map((offer) => (
              <TableRow key={offer.id}>
                <TableCell className="font-medium">
                  {offer.provider}
                  {offer.executionModelId !== model.id && (
                    <Link
                      className="block text-xs text-muted-foreground underline"
                      href={`/admin/automation/models/${params.type}/${encodeURIComponent(offer.executionModelId)}`}
                    >
                      {t('registrationSettings')}
                    </Link>
                  )}
                </TableCell>
                <TableCell>
                  <code className="text-xs">{offer.endpoint}</code>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={offer.hasReviewedPricing ? 'secondary' : 'warning'}
                  >
                    {offer.hasReviewedPricing ? t('reviewed') : t('unpriced')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    disabled={busy}
                    onClick={() =>
                      update.mutate({
                        executionModelId: offer.executionModelId,
                        isActive: !offer.isActive,
                      })
                    }
                  >
                    {offer.isActive ? t('disableOffer') : t('enableOffer')}
                  </Button>
                </TableCell>
                <TableCell>
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    disabled={busy}
                    onClick={() =>
                      providerUpdate.mutate({
                        provider: offer.provider,
                        isActive: !offer.isProviderActive,
                      })
                    }
                  >
                    {offer.isProviderActive
                      ? t('disableProviderGlobally')
                      : t('enableProviderGlobally')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap gap-3">
          <Select value={candidate} onValueChange={setCandidate}>
            <SelectTrigger className="w-96" aria-label={t('connectAria')}>
              <SelectValue placeholder={t('connectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {model.candidates
                .filter(
                  (item) =>
                    !model.offers.some(
                      (offer) => offer.executionModelId === item.id,
                    ),
                )
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.provider} · {item.label} · {item.key}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!candidate || busy}
            onClick={() => {
              update.mutate({ executionModelId: candidate, isActive: true });
              setCandidate('');
            }}
          >
            {t('connectProvider')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('connectHint')}</p>
      </section>
      <section className="space-y-4" aria-labelledby="model-prices">
        <h2 id="model-prices" className="text-lg font-semibold">
          {t('pricingTable')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('pricingTableHint')}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('provider')}</TableHead>
              <TableHead>{t('variant')}</TableHead>
              <TableHead>{t('component')}</TableHead>
              <TableHead>{t('providerPricePerUnit')}</TableHead>
              <TableHead>{t('withMargin')}</TableHead>
              <TableHead>{t('verified')}</TableHead>
              <TableHead>{t('source')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.offers.flatMap((offer) =>
              offer.rates.length
                ? offer.rates.map((rate) => (
                    <TableRow
                      key={`${offer.id}-${rate.component}-${rate.unit}-${JSON.stringify(rate.when)}`}
                    >
                      <TableCell>{offer.provider}</TableCell>
                      <TableCell>
                        {Object.entries(rate.when)
                          .map(([name, value]) => `${name}: ${value}`)
                          .join(' · ') || t('allSupportedSettings')}
                      </TableCell>
                      <TableCell>{rate.component}</TableCell>
                      <TableCell>
                        {[
                          t(
                            rate.isPerOutput
                              ? 'unitPricePerOutput'
                              : 'unitPrice',
                            {
                              price: usd(rate.unitPriceUsd),
                              unit: rate.unit,
                            },
                          ),
                          rate.includedUnits
                            ? t('includes', { count: rate.includedUnits })
                            : null,
                          rate.minimumUnits
                            ? t('minimum', { count: rate.minimumUnits })
                            : null,
                          rate.roundUnitsTo
                            ? t('roundsTo', { count: rate.roundUnitsTo })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </TableCell>
                      <TableCell>
                        {t('unitPrice', {
                          price: usd(
                            rate.unitPriceUsd * model.marginMultiplier,
                          ),
                          unit: rate.unit,
                        })}
                      </TableCell>
                      <TableCell>
                        {offer.verifiedAt?.slice(0, 10) ?? t('unverified')}
                      </TableCell>
                      <TableCell>
                        {offer.sourceUrl && (
                          <a
                            href={offer.sourceUrl}
                            rel="noreferrer"
                            target="_blank"
                            className="underline"
                          >
                            {t('providerPricingLink')}
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                : [
                    <TableRow key={offer.id}>
                      <TableCell>{offer.provider}</TableCell>
                      <TableCell colSpan={6}>{t('priceUnavailable')}</TableCell>
                    </TableRow>,
                  ],
            )}
          </TableBody>
        </Table>
      </section>
      <section className="space-y-4" aria-labelledby="model-usage">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="model-usage" className="text-lg font-semibold">
              {t('usageTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('usageHint')}</p>
          </div>
          <Select
            value={String(days)}
            onValueChange={(value) => setDays(Number(value))}
          >
            <SelectTrigger
              className="w-36 shrink-0"
              aria-label={t('usagePeriod')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[7, 30, 90].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {t('days', { count: value })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <h3 className="mb-4 font-medium">{t('generationsOverTime')}</h3>
            <div
              className="h-64"
              role="img"
              aria-label={t('dailyGenerationsAria')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily}>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date: string) => date.slice(5)}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Area
                    dataKey="generations"
                    stroke="hsl(var(--foreground))"
                    fill="hsl(var(--muted))"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <h3 className="mb-4 font-medium">{t('usageByProvider')}</h3>
            <div
              className="h-64"
              role="img"
              aria-label={t('providerGenerationsAria')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={providers}>
                  <XAxis dataKey="provider" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="generations" fill="hsl(var(--foreground))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        {!model.usage.length && (
          <p className="text-sm text-muted-foreground">{t('noUsage')}</p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('provider')}</TableHead>
              <TableHead>{t('recordedGenerations')}</TableHead>
              <TableHead>{t('vendorCost')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <TableRow key={provider.provider}>
                <TableCell>{provider.provider}</TableCell>
                <TableCell>
                  {provider.generations.toLocaleString('en-US')}
                </TableCell>
                <TableCell>{usd(provider.vendorCostUsd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t('pricingReview')}</h2>
        <ModelPricingDetails modelId={model.id} />
      </section>
    </main>
  );
}
