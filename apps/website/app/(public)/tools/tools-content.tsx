'use client';

import Card from '@ui/card/Card';
import PageLayout from '@web-components/PageLayout';
import { FileText, Scissors } from 'lucide-react';
import Link from 'next/link';

export default function ToolsContent(): React.ReactElement {
  return (
    <PageLayout
      badge="Free tools"
      badgeIcon={Scissors}
      compact
      description="Start with a public source, get a useful result before signup, then continue in the full Genfeed workspace."
      title="Free AI content tools"
    >
      <section className="container mx-auto px-6 py-20">
        <div className="grid max-w-5xl gap-6 md:grid-cols-2">
          <Card className="flex flex-col gap-5 p-8">
            <div className="flex size-11 items-center justify-center bg-fill/[0.05]">
              <FileText aria-hidden="true" className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                YouTube to long-form text
              </h2>
              <p className="mt-2 text-sm leading-6 text-surface/65">
                Turn one video into a standard article, LinkedIn article, X
                article, or newsletter.
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-primary hover:underline"
              href="/tools/youtube-long-form"
            >
              Try the free tool &rarr;
            </Link>
          </Card>
          <Card className="flex flex-col gap-5 p-8">
            <div className="flex size-11 items-center justify-center bg-fill/[0.05]">
              <Scissors aria-hidden="true" className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                YouTube transcript to clips
              </h2>
              <p className="mt-2 text-sm leading-6 text-surface/65">
                Extract a timestamped transcript, find three short-form clip
                opportunities, and render one preview free.
              </p>
            </div>
            <Link
              className="text-sm font-semibold text-primary hover:underline"
              href="/tools/youtube-clips"
            >
              Try the free tool &rarr;
            </Link>
          </Card>
        </div>
      </section>
    </PageLayout>
  );
}
