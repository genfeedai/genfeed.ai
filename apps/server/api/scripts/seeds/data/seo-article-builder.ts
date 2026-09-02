import { ArticleCategory } from '@genfeedai/contracts';
import { articleArtwork } from './article-artwork';
import type { SeedArticle } from './launch-articles';

type DecisionRow = {
  choice: string;
  fit: string;
  tradeoff: string;
};

type ArticleSection = {
  heading: string;
  paragraphs: readonly string[];
  points?: readonly string[];
};

type WorkflowStep = {
  action: string;
  detail: string;
};

type Faq = {
  answer: string;
  question: string;
};

type Source = {
  label: string;
  url: string;
};

export type SeoArticleBrief = {
  answer: string;
  category: ArticleCategory;
  decisionRows: readonly DecisionRow[];
  faq: readonly Faq[];
  internalLinks: readonly { label: string; url: string }[];
  intro: readonly [string, string];
  label: string;
  metrics: readonly string[];
  mistakes: readonly string[];
  publishedAt: string;
  sections: readonly ArticleSection[];
  slug: string;
  sources: readonly Source[];
  summary: string;
  workflow: readonly WorkflowStep[];
};

function renderList(items: readonly string[]): string {
  return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function renderSections(sections: readonly ArticleSection[]): string {
  return sections
    .map(
      ({ heading, paragraphs, points }) => `
<h2>${heading}</h2>
${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('\n')}
${points?.length ? renderList(points) : ''}`,
    )
    .join('\n');
}

function renderDecisionTable(rows: readonly DecisionRow[]): string {
  return `
<table>
  <thead><tr><th>Option</th><th>Best fit</th><th>Trade-off to accept</th></tr></thead>
  <tbody>
    ${rows
      .map(
        ({ choice, fit, tradeoff }) =>
          `<tr><td><strong>${choice}</strong></td><td>${fit}</td><td>${tradeoff}</td></tr>`,
      )
      .join('\n')}
  </tbody>
</table>`;
}

function renderWorkflow(steps: readonly WorkflowStep[]): string {
  return `<ol>${steps
    .map(
      ({ action, detail }) => `<li><strong>${action}</strong> ${detail}</li>`,
    )
    .join('')}</ol>`;
}

function renderFaq(faq: readonly Faq[]): string {
  return faq
    .map(({ answer, question }) => `<h3>${question}</h3>\n<p>${answer}</p>`)
    .join('\n');
}

function renderSources(sources: readonly Source[]): string {
  return `<ul>${sources
    .map(
      ({ label, url }) =>
        `<li><a href="${url}" rel="noopener noreferrer">${label}</a></li>`,
    )
    .join('')}</ul>`;
}

/**
 * Turns an editorial brief into sanitized, long-form HTML. The prose and
 * recommendations remain article-specific; this helper standardizes the parts
 * readers should be able to scan in every guide: answer, decision table,
 * workflow, measurement, failure modes, FAQ, and sources.
 */
export function buildSeoArticle(brief: SeoArticleBrief): SeedArticle {
  const content = `
<p>${brief.intro[0]}</p>
<p>${brief.intro[1]}</p>

<h2>The short answer</h2>
<p>${brief.answer}</p>

<h2>Choose the workflow before the tool</h2>
<p>A tool list is useful only after the operating constraint is clear. Decide
who owns the brief, what must remain consistent, where approval happens, and
which result will be measured. Otherwise a team buys overlapping generators
and still moves copy between tabs by hand.</p>
${renderDecisionTable(brief.decisionRows)}

${renderSections(brief.sections)}

<h2>A repeatable implementation workflow</h2>
<p>Run the first version manually and keep the hand-offs visible. Automation
should remove a proven bottleneck, not hide an undefined process. Each step
below needs an owner, an input, an output, and a clear reason to stop for human
review.</p>
${renderWorkflow(brief.workflow)}

<h2>How this fits into Genfeed</h2>
<p>Genfeed is designed as a content operating system rather than a single
generator. A brand keeps its voice, visual references, prompts, assets, content
plans, approvals, and publishing work in one tenant-aware workspace. Teams can
choose models per job instead of rebuilding the workflow whenever a model
changes.</p>
<p>Start with the <a href="https://genfeed.ai/">Genfeed workspace</a>, then use
the <a href="https://docs.genfeed.ai/">documentation</a> for self-hosting,
integrations, API, and MCP setup. The practical goal is traceability: a reviewer
should be able to see which brief produced an asset, which brand rules applied,
what changed during approval, and where the final version was distributed.</p>

<h2>What to measure</h2>
<p>Measure the workflow as well as the post. Reach without production context
cannot tell you whether the system improved. Capture a baseline for one normal
week, then compare the same content type and channel after the new process has
run for at least two cycles.</p>
${renderList(brief.metrics)}
<p>Keep quality and efficiency in the same scorecard. A faster workflow that
doubles corrections is not faster; a beautiful asset that misses the campaign
deadline is not effective. Record both the audience result and the human effort
required to achieve it.</p>

<h2>Common mistakes</h2>
${renderList(brief.mistakes)}
<p>The pattern behind these failures is premature scale. Teams automate volume
before they have a stable brief, approval rule, naming system, or feedback loop.
Fix the smallest broken hand-off first, document it, and only then increase the
number of channels or variants.</p>

<h2>Operator checklist</h2>
<ul>
  <li>The audience, job, channel, and desired action are explicit in the brief.</li>
  <li>Brand voice and visual constraints are attached as references, not remembered from chat.</li>
  <li>Every generated claim, likeness, and licensed asset has a review owner.</li>
  <li>The approval state is visible and the published version is immutable.</li>
  <li>Platform-specific crops, captions, alt text, and safe zones are checked.</li>
  <li>UTM naming and success metrics are defined before distribution.</li>
  <li>The team records what failed so the next brief improves.</li>
</ul>

<h2>Frequently asked questions</h2>
${renderFaq(brief.faq)}

<h2>Continue building the system</h2>
<ul>${brief.internalLinks
    .map(({ label, url }) => `<li><a href="${url}">${label}</a></li>`)
    .join('')}</ul>

<h2>Sources and further reading</h2>
<p>Product capabilities and platform rules change. The links below point to
first-party documentation or the vendor pages used for this guide; verify the
current limits before committing budget or production volume.</p>
${renderSources(brief.sources)}
`;

  return {
    category: brief.category,
    content,
    coverImageUrl: articleArtwork(brief.slug),
    label: brief.label,
    publishedAt: brief.publishedAt,
    slug: brief.slug,
    summary: brief.summary,
  };
}
