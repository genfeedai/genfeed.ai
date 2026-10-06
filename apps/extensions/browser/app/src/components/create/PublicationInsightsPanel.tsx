import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type { PublicationInsightDetailsProps } from '@genfeedai/props/extension/publication-insights.props';
import { Button } from '@ui/primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useState } from 'react';
import { usePublicationInsights } from '~hooks/use-publication-insights';
import { appDomain } from '~services/environment.service';

function PublicationInsightDetails({
  insight,
  isBusy,
  error,
  notice,
  connectHref,
  onRefresh,
  onLink,
}: PublicationInsightDetailsProps) {
  const [account, setAccount] = useState('');
  const sample = insight.latestSample;
  const accountUnavailable =
    insight.analyticsAvailability === 'missing-credential' ||
    Object.values(sample?.metrics ?? {}).some(
      (metric) =>
        metric.availability === 'expired' ||
        metric.availability === 'unauthorized',
    );
  const canLink =
    insight.isCapturedObservation &&
    insight.credentialId === null &&
    insight.linkCandidates.length > 0;
  const audience = {
    public: 'Public',
    private: 'Private',
    unlisted: 'Unlisted',
    unknown: 'Audience unavailable',
  }[insight.observedVisibility];
  const reason = {
    eligible: '',
    'missing-external-id': 'Publication identity unavailable',
    'missing-credential': 'Connect the original account',
    'unsupported-platform': 'Analytics unavailable for this platform',
    'unsupported-publication-kind':
      'Analytics unavailable for this publication',
    'provider-id-unresolved': 'Publication identity unresolved',
  }[insight.analyticsAvailability];
  return (
    <div className="min-w-0 space-y-3 break-words text-xs">
      <p className="whitespace-pre-wrap">{insight.description}</p>
      <p>
        {insight.platform} ·{' '}
        {insight.source === 'extension'
          ? 'Extension'
          : insight.source?.trim() || 'Source unavailable'}
      </p>
      <p>{audience}</p>
      {insight.urlKind !== 'unavailable' && (
        <a
          className="text-primary underline"
          href={
            insight.urlKind === 'permalink'
              ? (insight.url ?? undefined)
              : (insight.contextUrl ?? undefined)
          }
          target="_blank"
          rel="noopener noreferrer"
        >
          {insight.urlKind === 'permalink' ? 'Open post' : 'Open parent post'}
        </a>
      )}
      {sample ? (
        <>
          <dl className="grid min-w-0 grid-cols-2 gap-2">
            {(['views', 'likes', 'comments', 'shares', 'saves'] as const).map(
              (name) => (
                <div
                  key={name}
                  className="min-w-0 border border-border bg-background p-2"
                >
                  <dt className="capitalize text-muted-foreground">{name}</dt>
                  <dd>
                    {sample.metrics[name].availability === 'observed'
                      ? sample.metrics[name].value
                      : 'Unavailable'}
                  </dd>
                  {sample.metrics[name].availability !== 'observed' && (
                    <dd className="capitalize text-muted-foreground">
                      {sample.metrics[name].availability}
                    </dd>
                  )}
                </div>
              ),
            )}
          </dl>
          <p>Sample date: {new Date(sample.date).toLocaleString()}</p>
          <p>Last saved: {new Date(sample.updatedAt).toLocaleString()}</p>
        </>
      ) : (
        <p>
          {insight.analyticsAvailability === 'eligible' &&
          insight.collectionState === 'pending'
            ? 'Awaiting analytics'
            : 'Analytics unavailable'}
        </p>
      )}
      <p className="capitalize">{insight.collectionState}</p>
      {insight.collectionMessage && <p>{insight.collectionMessage}</p>}
      <Button
        withWrapper={false}
        variant={ButtonVariant.SECONDARY}
        isDisabled={isBusy || insight.analyticsAvailability !== 'eligible'}
        onClick={onRefresh}
        className="w-full text-xs"
      >
        Refresh analytics
      </Button>
      {reason && <p>{reason}</p>}
      {canLink && (
        <div className="space-y-2">
          <Select value={account} disabled={isBusy} onValueChange={setAccount}>
            <SelectTrigger
              aria-label="Select account"
              className="w-full text-xs"
            >
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {insight.linkCandidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            withWrapper={false}
            variant={ButtonVariant.SECONDARY}
            isDisabled={
              isBusy ||
              !insight.linkCandidates.some(
                (candidate) => candidate.id === account,
              )
            }
            onClick={() => onLink(account)}
            className="w-full text-xs"
          >
            Link account
          </Button>
        </div>
      )}
      {accountUnavailable && (
        <a
          className="block text-primary underline"
          href={connectHref ?? appDomain}
          target="_blank"
          rel="noopener noreferrer"
        >
          {connectHref
            ? insight.credentialId
              ? 'Reconnect account'
              : 'Connect account'
            : 'Open Genfeed to connect the original account'}
        </a>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}

export function PublicationInsightsPanel() {
  const state = usePublicationInsights();
  const organization = state.snapshot?.organizations.find(
    (item) => item.id === state.snapshot?.organizationId,
  );
  const brand = state.snapshot?.brands.find(
    (item) => item.id === state.snapshot?.brandId,
  );
  const connectHref =
    organization?.slug && brand?.slug
      ? new URL(
          createBrandAppRoute(
            encodeURIComponent(organization.slug),
            encodeURIComponent(brand.slug),
            APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS,
          ),
          appDomain,
        ).href
      : null;
  const data = state.pageData;
  return (
    <section className="min-w-0 space-y-3 border border-border bg-card p-3 text-foreground">
      <h3 className="text-sm font-semibold">Publication analytics</h3>
      {!state.snapshot || !state.lookup ? (
        <p className="text-xs">Open a published post to view its analytics.</p>
      ) : (
        <>
          {state.isLoading && (
            <p role="status" className="text-xs">
              Loading publication analytics
            </p>
          )}
          {data?.total === 0 && (
            <p className="text-xs">
              No recorded publication was found for this page
            </p>
          )}
          {data && (data.total > 1 || data.page > 1) && (
            <div className="min-w-0 space-y-2">
              <Select
                value={state.selectedPostId ?? ''}
                disabled={state.isLoading || state.isBusy}
                onValueChange={state.select}
              >
                <SelectTrigger
                  aria-label="Choose a publication"
                  className="w-full text-xs"
                >
                  <SelectValue placeholder="Choose a publication" />
                </SelectTrigger>
                <SelectContent>
                  {data.items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.publicationKind === 'post'
                        ? 'Post'
                        : item.publicationKind === 'reply'
                          ? 'Reply'
                          : 'Publication'}{' '}
                      · {item.description.slice(0, 80)}
                      {item.publicationDate
                        ? ` · ${new Date(item.publicationDate).toLocaleString()}`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs">
                Page {state.page} / {data.pages} · {data.total} publications
              </p>
              <div className="flex gap-2">
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.SECONDARY}
                  isDisabled={
                    state.page <= 1 || state.isLoading || state.isBusy
                  }
                  onClick={() =>
                    state.selectPage(
                      Math.max(1, Math.min(state.page - 1, data.pages)),
                    )
                  }
                >
                  Previous
                </Button>
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.SECONDARY}
                  isDisabled={
                    state.page >= data.pages || state.isLoading || state.isBusy
                  }
                  onClick={() => state.selectPage(state.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
          {state.insight && (
            <PublicationInsightDetails
              key={JSON.stringify([
                state.key,
                state.insight.id,
                state.insight.credentialId,
                state.insight.linkCandidates,
              ])}
              insight={state.insight}
              isBusy={state.isBusy || state.isLoading}
              error={state.error}
              notice={state.notice}
              connectHref={connectHref}
              onRefresh={state.refresh}
              onLink={state.link}
            />
          )}
          {state.insight && (
            <Button
              withWrapper={false}
              variant={ButtonVariant.SECONDARY}
              isDisabled={state.isBusy || state.isLoading}
              onClick={state.reload}
              className="w-full text-xs"
            >
              Reload saved metrics
            </Button>
          )}
          {state.error && (
            <>
              {!state.insight && (
                <p role="alert" className="text-xs">
                  {state.error}
                </p>
              )}
              <Button
                withWrapper={false}
                variant={ButtonVariant.SECONDARY}
                isDisabled={state.isBusy || state.isLoading}
                onClick={state.retry}
              >
                Retry
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
