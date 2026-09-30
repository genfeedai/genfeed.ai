import { AGENT_CLIENT_EXAMPLE_PROMPTS } from '@data/agent-clients.data';
import { MARKETING_ASSETS } from '@data/marketing-assets.data';
import type { AgentClientVisualProps } from '@props/agent-client.props';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';

export default function AgentClientExamples({
  client,
}: AgentClientVisualProps): React.ReactElement {
  return (
    <section className="container mx-auto px-6 py-12 sm:py-20">
      <div className="mb-10 max-w-2xl">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-surface/65">
          02 / From a brief to something real
        </p>
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Stay in {client.name}.<br />
          Create with Genfeed.
        </h2>
        <p className="mt-5 text-base leading-7 text-surface/75">
          Your brand context, creative tools, and content library travel with
          you. These examples show the kind of work you can ask for.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {(
          [
            [
              'campaign',
              'A campaign with your visual identity',
              'Generate product imagery from my brand guidelines and prepare three creative directions for review.',
            ],
            [
              'creator',
              'A story built for the screen',
              'Turn my launch brief into a vertical video concept, with a script and matching visuals.',
            ],
          ] as const
        ).map(([asset, title, prompt]) => (
          <figure
            key={asset}
            className="overflow-hidden rounded-xl border border-edge/10 bg-card"
          >
            <div className="relative aspect-[4/3]">
              <Image
                alt={MARKETING_ASSETS[asset].alt}
                className="object-cover"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                src={MARKETING_ASSETS[asset].src}
              />
            </div>
            <figcaption className="p-6">
              <p className="text-xs text-surface/65">
                Illustrative generated output
              </p>
              <h3 className="mt-2 text-xl font-semibold">{title}</h3>
              <p className="mt-4 text-base leading-7 text-surface/75">
                “{prompt}”
              </p>
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="mt-10 grid gap-6 border-t border-edge/10 pt-8 md:grid-cols-2">
        {AGENT_CLIENT_EXAMPLE_PROMPTS.map((prompt) => (
          <p
            className="flex items-start gap-3 text-base leading-7 text-surface/75"
            key={prompt}
          >
            <ArrowRight aria-hidden className="mt-1.5 size-4 shrink-0" />
            <span>“{prompt}”</span>
          </p>
        ))}
      </div>
    </section>
  );
}
