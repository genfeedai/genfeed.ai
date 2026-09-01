import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import type {
  IModelProviderContractSnapshot,
  IModelProviderContracts,
} from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';

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

function formatField(property: SchemaProperty): string {
  const parts: string[] = [];
  if (typeof property.type === 'string') {
    parts.push(property.type);
  }
  if (Array.isArray(property.enum)) {
    parts.push(property.enum.map(String).join(' | '));
  }
  if (property.default !== undefined) {
    parts.push(`default ${String(property.default)}`);
  }
  if (typeof property.minimum === 'number') {
    parts.push(`min ${property.minimum}`);
  }
  if (typeof property.maximum === 'number') {
    parts.push(`max ${property.maximum}`);
  }
  return parts.join(' · ') || 'structured value';
}

function SchemaFields({
  label,
  schema,
}: {
  label: string;
  schema: Record<string, unknown>;
}) {
  const properties = getSchemaProperties(schema);
  const required = new Set(
    Array.isArray(schema.required) ? schema.required.map(String) : [],
  );

  return (
    <div>
      <h5 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground/60">
        {label}
      </h5>
      {properties.length === 0 ? (
        <p className="text-xs text-foreground/50">No top-level fields.</p>
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
                    required
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
          <span className="text-foreground/80">Version:</span>{' '}
          <code className="break-all">{snapshot.version}</code>
        </p>
        {snapshot.schemaFamily && (
          <p>
            <span className="text-foreground/80">Family:</span>{' '}
            {snapshot.schemaFamily}
          </p>
        )}
        {pricing && (
          <p>
            <span className="text-foreground/80">Pricing:</span> {pricing}
          </p>
        )}
        <p>
          <span className="text-foreground/80">Last seen:</span>{' '}
          {new Date(snapshot.lastSeenAt).toLocaleString()}
        </p>
        {snapshot.unsupportedReason && (
          <p className="text-destructive">{snapshot.unsupportedReason}</p>
        )}
      </div>
      <SchemaFields label="Input schema" schema={snapshot.inputSchema} />
      <SchemaFields label="Output schema" schema={snapshot.outputSchema} />
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
  return (
    <div className="mt-6 space-y-3 border-t border-white/[0.08] pt-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          Provider contract
        </h3>
        {contracts && (
          <p className="mt-1 break-all font-mono text-xs text-foreground/50">
            {contracts.provider} · {contracts.endpoint}
          </p>
        )}
      </div>
      {isLoading && (
        <p className="text-sm text-foreground/60">Loading contract details…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive">
          Provider contract details could not be loaded.
        </p>
      )}
      {!isLoading && !isError && contracts?.pending && (
        <ContractSnapshot label="Pending review" snapshot={contracts.pending} />
      )}
      {!isLoading && !isError && contracts?.reviewed && (
        <ContractSnapshot
          label="Reviewed runtime"
          snapshot={contracts.reviewed}
        />
      )}
      {!isLoading &&
        !isError &&
        !contracts?.pending &&
        !contracts?.reviewed && (
          <p className="text-sm text-foreground/60">
            No reviewed or pending provider contract is stored yet.
          </p>
        )}
    </div>
  );
}
