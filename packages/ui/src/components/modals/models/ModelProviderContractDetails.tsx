'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type {
  IModelProviderContractSnapshot,
  IModelProviderContracts,
} from '@genfeedai/contracts/interfaces';
import Badge from '@ui/display/badge/Badge';
import { useTranslations } from 'next-intl';

type SchemaProperty = Record<string, unknown>;

function getSchemaProperties(
  schema: Record<string, unknown>,
): Array<[string, SchemaProperty]> {
  const properties = schema.properties;
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  ) {
    return [];
  }
  return Object.entries(properties).filter(
    (entry): entry is [string, SchemaProperty] =>
      Boolean(entry[1]) &&
      typeof entry[1] === 'object' &&
      !Array.isArray(entry[1]),
  );
}

function SchemaFields({
  label,
  schema,
}: {
  label: string;
  schema: Record<string, unknown>;
}) {
  const translate = useTranslations('common.modelProviderContract');
  const properties = getSchemaProperties(schema);
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map(String) : [],
  );
  const formatField = (property: SchemaProperty): string => {
    const parts: string[] = [];
    if (typeof property.type === 'string') {
      parts.push(property.type);
    }
    if (Array.isArray(property.enum)) {
      parts.push(property.enum.map(String).join(' | '));
    }
    if (property.default !== undefined) {
      parts.push(
        translate('field.default', { value: String(property.default) }),
      );
    }
    if (typeof property.minimum === 'number') {
      parts.push(translate('field.minimum', { value: property.minimum }));
    }
    if (typeof property.maximum === 'number') {
      parts.push(translate('field.maximum', { value: property.maximum }));
    }
    return parts.join(' · ') || translate('field.structuredValue');
  };

  return (
    <div>
      <h5 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/60">
        {label}
      </h5>
      {properties.length === 0 ? (
        <p className="text-xs text-foreground/50">
          {translate('noTopLevelFields')}
        </p>
      ) : (
        <div className="space-y-2">
          {properties.map(([name, property]) => (
            <div
              key={name}
              className="rounded-md border border-white/[0.08] bg-secondary/50 p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs text-foreground">{name}</code>
                {required.has(name) && (
                  <Badge variant="outline" size={ComponentSize.SM}>
                    {translate('field.required')}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-foreground/60">
                {formatField(property)}
              </p>
              {typeof property.description === 'string' && (
                <p className="mt-1 text-xs text-foreground/50">
                  {property.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractSnapshot({
  label,
  snapshot,
}: {
  label: string;
  snapshot: IModelProviderContractSnapshot;
}) {
  const translate = useTranslations('common.modelProviderContract');
  const pricing = [snapshot.unitPrice, snapshot.currency, snapshot.billingUnit]
    .filter(Boolean)
    .join(' · ');

  return (
    <section className="space-y-4 rounded-lg border border-white/[0.08] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        <Badge
          variant={
            snapshot.mappingStatus === 'supported'
              ? 'success'
              : ButtonVariant.SECONDARY
          }
          size={ComponentSize.SM}
        >
          {snapshot.mappingStatus}
        </Badge>
      </div>
      <div className="space-y-1 text-xs text-foreground/60">
        <p>
          <span className="text-foreground/80">
            {translate('versionLabel')}
          </span>{' '}
          <code className="break-all">{snapshot.version}</code>
        </p>
        {snapshot.schemaFamily && (
          <p>
            <span className="text-foreground/80">
              {translate('familyLabel')}
            </span>{' '}
            {snapshot.schemaFamily}
          </p>
        )}
        {pricing && (
          <p>
            <span className="text-foreground/80">
              {translate('pricingLabel')}
            </span>{' '}
            {pricing}
          </p>
        )}
        <p>
          <span className="text-foreground/80">
            {translate('lastSeenLabel')}
          </span>{' '}
          {new Date(snapshot.lastSeenAt).toLocaleString()}
        </p>
        {snapshot.unsupportedReason && (
          <p className="text-destructive">{snapshot.unsupportedReason}</p>
        )}
      </div>
      <SchemaFields
        label={translate('inputSchema')}
        schema={snapshot.inputSchema}
      />
      <SchemaFields
        label={translate('outputSchema')}
        schema={snapshot.outputSchema}
      />
    </section>
  );
}

export default function ModelProviderContractDetails({
  contracts,
  isError,
  isLoading,
}: {
  contracts?: IModelProviderContracts;
  isError: boolean;
  isLoading: boolean;
}) {
  const translate = useTranslations('common.modelProviderContract');

  return (
    <div className="mt-6 space-y-3 border-t border-white/[0.08] pt-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          {translate('title')}
        </h3>
        {contracts && (
          <p className="mt-1 break-all font-mono text-xs text-foreground/50">
            {contracts.provider} · {contracts.endpoint}
          </p>
        )}
      </div>
      {isLoading && (
        <p className="text-sm text-foreground/60">{translate('loading')}</p>
      )}
      {isError && (
        <p className="text-sm text-destructive">{translate('error')}</p>
      )}
      {!isLoading && !isError && contracts?.pending && (
        <ContractSnapshot
          label={translate('pendingReview')}
          snapshot={contracts.pending}
        />
      )}
      {!isLoading && !isError && contracts?.reviewed && (
        <ContractSnapshot
          label={translate('reviewedRuntime')}
          snapshot={contracts.reviewed}
        />
      )}
      {!isLoading &&
        !isError &&
        !contracts?.pending &&
        !contracts?.reviewed && (
          <p className="text-sm text-foreground/60">{translate('empty')}</p>
        )}
    </div>
  );
}
