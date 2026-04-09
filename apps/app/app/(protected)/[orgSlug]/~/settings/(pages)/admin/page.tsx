import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Admin Settings');

export default function SettingsAdminPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-white">Admin Settings</h2>
          <p className="max-w-3xl text-sm text-white/70">
            This area is tenant-scoped administration for the current customer
            account. Cross-client platform management now belongs to the
            protected top-level <code>/admin</code> route, not inside an
            org-scoped settings tree.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-6">
        <h3 className="text-base font-semibold text-white">Scope</h3>
        <p className="mt-3 max-w-3xl text-sm text-white/70">
          Use this area for customer-account administration in the current org.
          Use <code>/admin</code> only when you need platform-wide management
          across multiple clients, orgs, or brands.
        </p>
      </section>
    </div>
  );
}
