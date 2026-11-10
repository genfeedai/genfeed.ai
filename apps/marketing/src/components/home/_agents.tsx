import {
  AGENT_CLIENT_FAMILIES,
  getAgentClient,
} from '@data/agent-clients.data';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentClientLogo from '@web-components/content/AgentClientLogo';
import Link from 'next/link';

/**
 * Where the work starts: the agent the visitor already has open.
 *
 * Each family links to its own install page, so the homepage never repeats
 * install steps that differ per client. The list is derived from the same
 * families the connect dialog uses, so the two cannot drift apart.
 */
export default function HomeAgents(): React.ReactElement {
  return (
    <section
      id="agents"
      className="gen-section-spacing border-b border-foreground/5"
    >
      <div className="container mx-auto px-6">
        <div className="flex max-w-3xl flex-col gap-4" data-reveal="up">
          <Heading
            id="home-agents-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-5xl"
          >
            Start in your agent.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Add Genfeed over MCP and work where you already work. The dashboard
            is where you review drafts, publish and see what worked.
          </Text>
        </div>

        <ul
          aria-labelledby="home-agents-heading"
          className="mt-10 grid grid-cols-1 gap-px bg-foreground/10 sm:grid-cols-2 lg:grid-cols-4"
        >
          {AGENT_CLIENT_FAMILIES.map((family) => (
            // The link's ::after covers the cell, so the whole cell is the tap
            // target while the link's name stays the client's name.
            <li
              key={family.name}
              className="relative flex items-center gap-4 bg-background p-6 transition-colors hover:bg-foreground/5"
              data-reveal="up"
            >
              <AgentClientLogo client={getAgentClient(family.slugs[0])} />
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  className="text-sm font-semibold text-foreground after:absolute after:inset-0"
                  href={`/${family.slugs[0]}`}
                >
                  {family.name}
                </Link>
                <Text className="text-sm text-foreground/70">
                  {family.description}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
