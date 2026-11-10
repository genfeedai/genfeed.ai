import {
  AGENT_CLIENT_FAMILIES,
  getAgentClient,
} from '@data/agent-clients.data';
import { CardGap, CardPadding, CardVariant } from '@genfeedai/contracts';
import type { HomeReviewRow, HowStep } from '@props/website/home.props';
import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentClientLogo from '@web-components/content/AgentClientLogo';

const HOW_STEPS: HowStep[] = [
  {
    description:
      'Add Genfeed to Claude, ChatGPT, Codex, Cursor or any MCP client. One sign-in.',
    title: 'Connect',
  },
  {
    description:
      'Brief your agent in your own words, or drop in a reference. It works from your brand context.',
    title: 'Ask',
  },
  {
    description:
      'Open the dashboard to approve drafts, publish to your channels and see what worked.',
    title: 'Review',
  },
];

const CONNECT_FAMILIES = AGENT_CLIENT_FAMILIES.slice(0, 4);

const REVIEW_ROWS: HomeReviewRow[] = [
  { label: 'Article', state: 'Needs review', variant: 'outline' },
  { label: 'Newsletter', state: 'Needs review', variant: 'outline' },
  { label: 'LinkedIn post', state: 'Scheduled', variant: 'info' },
  { label: 'Reel', state: 'Published', variant: 'success' },
];

function ConnectMock(): React.ReactElement {
  return (
    <ul className="flex flex-col gap-2">
      {CONNECT_FAMILIES.map((family, index) => (
        <Card
          as="li"
          key={family.name}
          bodyClassName="flex-row items-center justify-between"
          padding={CardPadding.SM}
        >
          <span className="flex items-center gap-3">
            <AgentClientLogo
              className="size-5"
              client={getAgentClient(family.slugs[0])}
            />
            <Text className="text-sm text-foreground">{family.name}</Text>
          </span>
          {index === 0 ? (
            <Badge casing="normal" variant="success">
              Connected
            </Badge>
          ) : (
            <Badge casing="normal" variant="outline">
              Connect
            </Badge>
          )}
        </Card>
      ))}
    </ul>
  );
}

function AskMock(): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <Text className="ml-auto block max-w-[85%] rounded-md bg-foreground/10 px-3 py-2 text-sm text-foreground">
        Turn this video into an article and a week of posts.
      </Text>
      <Card className="max-w-[92%]" gap={CardGap.SM} padding={CardPadding.SM}>
        <Text className="text-sm text-foreground/80">
          Done. One article and five posts are waiting in your dashboard.
        </Text>
        <span className="flex flex-wrap gap-1.5">
          <Badge casing="normal" variant="outline">
            1 article
          </Badge>
          <Badge casing="normal" variant="outline">
            5 posts
          </Badge>
          <Badge casing="normal" variant="outline">
            1 cover image
          </Badge>
        </span>
      </Card>
    </div>
  );
}

function ReviewMock(): React.ReactElement {
  return (
    <ul className="flex flex-col gap-2">
      {REVIEW_ROWS.map((row) => (
        <Card
          as="li"
          key={row.label}
          bodyClassName="flex-row items-center justify-between"
          padding={CardPadding.SM}
        >
          <Text className="text-sm text-foreground">{row.label}</Text>
          <Badge casing="normal" variant={row.variant}>
            {row.state}
          </Badge>
        </Card>
      ))}
    </ul>
  );
}

const STEP_MOCKS: readonly React.ReactElement[] = [
  <ConnectMock key="connect" />,
  <AskMock key="ask" />,
  <ReviewMock key="review" />,
];

export default function HomeHow(): React.ReactElement {
  return (
    <section
      id="how"
      className="gen-section-spacing border-b border-foreground/5"
    >
      <div className="container mx-auto px-6">
        <div className="flex flex-col mb-10 max-w-3xl gap-4" data-reveal="up">
          <Text className="text-xs font-bold uppercase tracking-[0.16em] text-foreground/80">
            How it works
          </Text>
          <Heading
            id="home-workflow-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-5xl"
          >
            Connect, ask, review.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Your agent does the work. Brand memory, drafts and results live in
            one dashboard.
          </Text>
        </div>

        <ol
          aria-labelledby="home-workflow-heading"
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
          {HOW_STEPS.map((item, index) => (
            <li key={item.title} data-reveal="up">
              <Card className="h-full" padding={CardPadding.SM}>
                <div className="flex h-full flex-col gap-5 p-3">
                  <div className="flex items-center gap-3">
                    <Badge shape="pill" variant="inverse">
                      {index + 1}
                    </Badge>
                    <Heading
                      as="h3"
                      className="text-xl font-semibold text-foreground"
                    >
                      {item.title}
                    </Heading>
                  </div>
                  <Card variant={CardVariant.INSET}>
                    <div aria-hidden="true" className="min-h-44">
                      {STEP_MOCKS[index]}
                    </div>
                  </Card>
                  <Text className="text-sm leading-6 text-foreground/80">
                    {item.description}
                  </Text>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
