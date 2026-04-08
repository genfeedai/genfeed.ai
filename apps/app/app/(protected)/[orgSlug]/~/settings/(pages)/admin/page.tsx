import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Admin Settings');

export default function SettingsAdminPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Admin Settings</h2>
          <p className="max-w-3xl text-sm text-white/70">
            This area is reserved for the main administrator of the customer
            account. Use it to manage account-level administration inside the
            main product surface without relying on the legacy standalone admin
            app.
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6">
          <h3 className="text-base font-semibold text-white">Customer scope</h3>
          <p className="mt-3 text-sm text-white/70">
            These settings belong to the customer-facing Genfeed app and should
            cover administration for that customer account, organization, and
            workspace. They are distinct from the localhost-only Genfeed team
            control plane.
          </p>
        </div>

        <aside className="rounded-2xl border border-white/10 bg-black/20 p-6">
          <h3 className="text-base font-semibold text-white">Intended scope</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            <li>Customer account and organization administration</li>
            <li>Workspace-level admin policies and permissions</li>
            <li>Billing, credentials, integrations, and account controls</li>
            <li>
              Any future customer-facing admin capabilities in the main app
            </li>
          </ul>
        </aside>
      </section>
    </div>
  );
}
