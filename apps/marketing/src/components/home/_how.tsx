import type { HowStep } from '@props/website/home.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';

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

export default function HomeHow(): React.ReactElement {
  return (
    <section
      id="how"
      className="gen-section-spacing border-b border-foreground/5"
    >
      <div className="container mx-auto px-6">
        <div className="flex flex-col mb-10 max-w-3xl gap-4" data-reveal="up">
          <Heading
            id="home-workflow-heading"
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.02em] sm:text-5xl"
          >
            Watch it work.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Your agent does the work. Brand memory, drafts and results live in
            one dashboard, where you approve what goes out.
          </Text>
        </div>

        <ol
          aria-labelledby="home-workflow-heading"
          className="grid grid-cols-1 gap-px bg-foreground/10 sm:grid-cols-3"
        >
          {HOW_STEPS.map((item) => (
            <li
              key={item.title}
              className="flex flex-col gap-3 bg-background p-8"
              data-reveal="up"
            >
              <Heading
                as="h3"
                className="text-xl font-semibold text-foreground"
              >
                {item.title}
              </Heading>
              <Text className="text-sm leading-6 text-foreground/80">
                {item.description}
              </Text>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
