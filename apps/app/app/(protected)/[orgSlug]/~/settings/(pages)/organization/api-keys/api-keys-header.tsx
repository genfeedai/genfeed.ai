'use client';

export default function ApiKeysHeader() {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold">API Keys</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Create Genfeed keys for headless clients and MCP servers. Genfeed uses
        the server-configured providers by default. Add your own provider API
        keys only if you want to override hosted access. When using your own
        key, no credits are deducted.
      </p>
    </div>
  );
}
