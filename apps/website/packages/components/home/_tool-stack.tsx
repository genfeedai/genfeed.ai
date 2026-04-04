'use client';

const TOOLS = [
  'Video generator',
  'Image generator',
  'Voice tool',
  'Scheduler',
  'Design suite',
] as const;

export default function HomeToolStack() {
  return (
    <section className="gen-section-spacing">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold uppercase tracking-widest gen-text-muted mb-4">
            Why juggle 5 tools?
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mb-6">
            {TOOLS.map((tool, i) => (
              <span key={tool} className="text-sm text-surface/40">
                {tool}
                {i < TOOLS.length - 1 && (
                  <span className="text-surface/15 ml-3">+</span>
                )}
              </span>
            ))}
          </div>
          <p className="text-surface/40 text-sm">
            5 logins. 5 billing cycles. Zero integration.{' '}
            <span className="text-surface/60 font-medium">
              Or one platform that does it all.
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
