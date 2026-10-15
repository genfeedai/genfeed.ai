/**
 * Help articles for Genfeed Cloud (genfeed.ai/articles, category `help`).
 *
 * docs.genfeed.ai is self-host and API reference only. The hosted-product
 * pages that used to live there (`cloud/*`, `advanced/members-guide`,
 * `core/self-hosted-vs-cloud`, `getting-started`) were removed in #6970, so
 * Cloud users get their help content here instead. The in-app Help page links
 * to these slugs (`EnvironmentService.help`).
 *
 * Authoring rules:
 * - Describe only what the app does today. Anything unverified is left out of
 *   the visible copy and recorded as an HTML `<!-- TODO(help): ... -->`
 *   comment at the spot that needs a decision. The sanitizer strips comments on
 *   render, so readers never see them.
 * - No fixed prices or credit amounts: those change independently of a release.
 *   Point at https://genfeed.ai/pricing instead.
 * - `content` is sanitized HTML, not markdown (see launch-articles.ts).
 * - Help articles ship without `coverImageUrl`; the site derives a stable cover
 *   from the slug until editorial artwork exists.
 *
 * Keep `helpArticleSlugs` in `apps/website/packages/data/help-articles.data.ts`
 * aligned with the slugs below; `help-articles.spec.ts` enforces it.
 */

import { ArticleCategory } from '@genfeedai/contracts';
import type { SeedArticle } from './launch-articles';

export type HelpSeedArticle = Omit<SeedArticle, 'coverImageUrl'> & {
  coverImageUrl?: string;
};

const SITE = 'https://genfeed.ai';
const APP = 'https://app.genfeed.ai';

const SLUGS = {
  approvalQueue: 'approval-queue-review-before-publishing',
  brand: 'brand-setup-and-brand-memory',
  cloudVsSelfHosted: 'genfeed-cloud-vs-self-hosted',
  connectAccounts: 'connect-your-social-accounts',
  credits: 'how-credits-and-billing-work',
  gettingStarted: 'getting-started-with-genfeed-cloud',
  mcp: 'connect-claude-code-or-cursor-to-genfeed-cloud-mcp',
  organizations: 'organizations-in-genfeed-cloud',
  settings: 'account-and-workspace-settings',
  studio: 'using-studio-for-images-and-video',
  team: 'invite-your-team-roles-and-members',
} as const;

type HelpSlug = (typeof SLUGS)[keyof typeof SLUGS];

const LABELS: Record<HelpSlug, string> = {
  [SLUGS.approvalQueue]: 'The approval queue: review before publishing',
  [SLUGS.brand]: 'Brand setup and brand memory',
  [SLUGS.cloudVsSelfHosted]: 'Genfeed Cloud vs self-hosted',
  [SLUGS.connectAccounts]: 'Connect your social accounts',
  [SLUGS.credits]: 'How credits and billing work',
  [SLUGS.gettingStarted]: 'Getting started with Genfeed Cloud',
  [SLUGS.mcp]: 'Connect Claude Code or Cursor to Genfeed Cloud',
  [SLUGS.organizations]: 'Organizations in Genfeed Cloud',
  [SLUGS.settings]: 'Account and workspace settings',
  [SLUGS.studio]: 'Using Studio for images and video',
  [SLUGS.team]: 'Invite your team: roles and members',
};

function articleUrl(slug: HelpSlug): string {
  return `${SITE}/articles/${slug}`;
}

function renderRelated(slugs: readonly HelpSlug[]): string {
  const items = slugs
    .map((slug) => `<li><a href="${articleUrl(slug)}">${LABELS[slug]}</a></li>`)
    .join('');

  return `
<h2>Related help</h2>
<ul>${items}<li><a href="${SITE}/contact">Contact Genfeed support</a></li></ul>`;
}

const GETTING_STARTED = `
<p>Genfeed Cloud is the hosted version of Genfeed at
<a href="${APP}">app.genfeed.ai</a>. This guide takes you from a new account to
your first post: set up a brand, connect a channel, write the post, and publish
or schedule it.</p>

<p>Running Genfeed on your own infrastructure instead? Read
<a href="${articleUrl(SLUGS.cloudVsSelfHosted)}">Genfeed Cloud vs self-hosted</a>
first.</p>

<h2>1. Create your account</h2>
<p>Go to <a href="${APP}/sign-up">app.genfeed.ai/sign-up</a> and create an
account. Creating an account is free. Generating media and other metered work
uses credits, which are covered in
<a href="${articleUrl(SLUGS.credits)}">How credits and billing work</a>.</p>
<!-- TODO(help): confirm the starter credit amount and how long it lasts. The code has onboarding gift/trial constants and a "first 3 days" success-screen string that disagree with each other, so no number is stated here. -->

<h2>2. Set up your brand</h2>
<p>Onboarding starts with your brand. Enter your <strong>Website URL</strong>,
choose <strong>Scan website</strong>, then review and approve the brand guide
Genfeed drafts from your site. You can choose <strong>Skip for now</strong> and
fill the brand in later from Brand Kit.</p>
<p>Your brand guide is what keeps generated posts and images consistent. The
details are in
<a href="${articleUrl(SLUGS.brand)}">Brand setup and brand memory</a>.</p>
<!-- TODO(help): describe the agent onboarding conversation that follows the brand step on Cloud (route /{orgSlug}/~/agent/onboarding): what it asks and what it produces. -->

<h2>3. Connect an account</h2>
<p>To publish, connect at least one channel to your brand. Open the brand's
settings, choose <strong>Connected accounts</strong>, then
<strong>Connect account</strong> and pick a platform. You can skip this step and
still save drafts. The full walkthrough is in
<a href="${articleUrl(SLUGS.connectAccounts)}">Connect your social accounts</a>.</p>

<h2>4. Write your first post</h2>
<ol>
  <li>Open <strong>Publishing</strong> and go to <strong>Posts</strong>.</li>
  <li>Choose <strong>New post</strong>. The composer opens with the prompt
  "Write once, then choose where it goes."</li>
  <li>Write the post and pick one or more destinations under
  <strong>Post to</strong>.</li>
  <li>Choose <strong>Create Post</strong>.</li>
</ol>
<p>If you select no account, the post is saved as a draft. Nothing goes out
until you publish or schedule it.</p>

<h2>5. Publish or schedule</h2>
<p>Open the post from the Posts list. From there you can publish it now or
schedule it for a date and time. Scheduling is available for YouTube, TikTok,
Instagram, X and LinkedIn; see the channel notes in
<a href="${articleUrl(SLUGS.connectAccounts)}">Connect your social accounts</a>.</p>
<!-- TODO(help): confirm the exact labels and layout of the publish and schedule controls on the post detail page ("Publish now" / "Schedule" appear in the post sidebar tests). -->

<h2>If your content needs review first</h2>
<p>Batches of generated drafts wait in the approval queue until someone
approves, rejects, or asks for changes. Turn on the approval gate for a brand
under <strong>Publishing</strong> settings. See
<a href="${articleUrl(SLUGS.approvalQueue)}">The approval queue</a>.</p>
<!-- TODO(help): state whether a post you write by hand in the composer is also subject to the brand approval gate. Only generated batches are confirmed to land in the queue. -->

<h2>Where to go next</h2>
<ul>
  <li>Create images and video in
  <a href="${articleUrl(SLUGS.studio)}">Studio</a>.</li>
  <li>Invite collaborators in
  <a href="${articleUrl(SLUGS.team)}">Invite your team</a>.</li>
  <li>Drive Genfeed from your editor with
  <a href="${articleUrl(SLUGS.mcp)}">Claude Code or Cursor</a>.</li>
</ul>
${renderRelated([SLUGS.credits, SLUGS.settings])}
`;

const CREDITS_AND_BILLING = `
<p>Genfeed Cloud meters generation and other managed work in credits. Credits
belong to your organization, so everyone in the workspace draws from the same
balance. This article explains where to see your balance, what spends credits,
and where to manage your plan.</p>

<p>Prices, included credits, and plan terms change independently of the
product. Use <a href="${SITE}/pricing">genfeed.ai/pricing</a> and the checkout
screen as the source of truth before you buy.</p>

<h2>Plans and top-ups</h2>
<p>Genfeed Cloud has three offers: <strong>Pay As You Go</strong>,
<strong>Agencies</strong> and <strong>Done for you</strong>.
Pay As You Go has no monthly subscription; you buy credits when you need them.
Agencies is a self-serve subscription that includes credits each month, and
Done for you is arranged with Genfeed directly.</p>
<p>You can add credits to any plan from the Credits page. Choose
<strong>Add credit</strong>, pick a preset pack or enter a custom amount, and
complete checkout.</p>
<!-- TODO(help): decide whether to publish the preset pack sizes and the custom purchase minimum and maximum. They exist in packages/pricing/src/plans-pricing.ts but are volatile, so they are omitted. -->

<h2>Find your balance</h2>
<p>Open <strong>Settings</strong>, switch to your organization, and choose
<strong>Credits</strong> (<code>/{orgSlug}/~/settings/credits</code>). The page
shows your <strong>Balance</strong> and <strong>Credits left</strong>, a
progress bar for <strong>Credits left this cycle</strong>, and a low-credit
warning when the organization falls below 1,000 credits. The top bar shows the
same balance, with a <strong>Buy credits</strong> shortcut.</p>

<h2>How amounts are displayed</h2>
<ul>
  <li><strong>Balance:</strong> whole credits, always rounded down, with
  thousands separators (<code>4,900</code>). From 100,000 credits the top bar
  abbreviates it (<code>124k</code>, <code>1.2M</code>); hover to see the exact
  number.</li>
  <li><strong>Cost of a message, tool call or transaction:</strong> at most one
  decimal (<code>0.4</code>, <code>12.5</code>). Anything below 0.1 shows as
  <code>&lt;0.1</code>, and zero shows as <code>Free</code>.</li>
  <li><strong>Estimates:</strong> Studio and the model pickers show "Estimated"
  or "≈" costs before you generate. The final cost depends on what the model
  actually uses.</li>
</ul>

<h2>How agent chat is billed</h2>
<p>Agent chat is billed by usage. One message can take several model rounds, for
example one round to call a tool and another to write the answer. For each round
Genfeed holds an estimate against your balance, runs the model, then settles the
hold to the real amount from the tokens actually used. A short reply costs less
than a long, tool-heavy one. If a round fails before it completes, the hold is
released.</p>
<p>Tools the agent calls, such as image or video generation, are billed at their
own credit cost in addition to the chat rounds.</p>

<h2>What does not cost Genfeed credits</h2>
<ul>
  <li>Generation that runs on your own provider key (bring your own key, or
  BYOK) draws no Genfeed credits. BYOK is a paid-plan feature on Genfeed
  Cloud; add your keys under <strong>Settings &rarr; Integrations</strong>.</li>
  <li>Studio shows <strong>Your API key &middot; 0 credits</strong> when a
  generation will run on your own key.</li>
</ul>
<!-- TODO(help): confirm whether turns that run on a user's own Claude Code or Codex subscription from the desktop app are credit-free, and whether the chat brand interview is credit-free. The guided Brand Kit interview shows "New interview: 10 credits. Resume is free." in the app, which contradicts the retired docs page, so neither claim is made. -->

<h2>The free plan model</h2>
<p>Without an active paid subscription, every agent turn runs on
<strong>DeepSeek V4 Flash</strong>. Model pickers show "Free plans run every
agent on DeepSeek V4 Flash. Upgrade to choose any model." instead of the model
list. A paid plan lets you choose the model per turn.</p>

<h2>Manage your subscription</h2>
<p>Open <strong>Settings &rarr; Subscription</strong>
(<code>/{orgSlug}/~/settings/subscription</code>) to see your plan, when the
current period ends, and the plan options. Choose <strong>Switch to
&lt;plan&gt;</strong> to change tiers, or <strong>Open Billing Portal</strong>
to manage the subscription in Stripe's hosted portal.</p>
<!-- TODO(help): confirm which actions the Stripe billing portal exposes (invoices, payment method, cancellation). The app has no in-app invoice list. -->
<p><strong>Settings &rarr; Usage</strong> shows cost and usage reports, at both
the organization and the brand level.</p>

<h2>When your balance reaches zero</h2>
<p>The top bar turns critical and reads "You are out of credits. Buy more to
keep generating." Metered actions are refused until you add credits or your
plan's monthly credits renew.</p>
${renderRelated([SLUGS.organizations, SLUGS.studio, SLUGS.settings])}
`;

const ORGANIZATIONS = `
<p>An organization is your workspace in Genfeed Cloud. It is the tenant
boundary: brands, members, credits, API keys and integrations all belong to one
organization, and nothing is shared across organizations.</p>

<h2>What lives in an organization</h2>
<ul>
  <li><strong>Brands.</strong> An organization has one or more brands. Each
  brand has its own profile, Brand Kit, knowledge, connected accounts, agent
  settings, publishing settings and skills.</li>
  <li><strong>Members.</strong> People you invite, with roles. See
  <a href="${articleUrl(SLUGS.team)}">Invite your team</a>.</li>
  <li><strong>Credits and plan.</strong> The credit balance and subscription
  are organization-level. See
  <a href="${articleUrl(SLUGS.credits)}">How credits and billing work</a>.</li>
  <li><strong>Organization settings.</strong> API keys, webhooks, provider keys,
  default models and agent policies. See
  <a href="${articleUrl(SLUGS.settings)}">Account and workspace settings</a>.</li>
</ul>
<!-- TODO(help): the Subscription page can show a shared "Billing account" with "Funded organizations" on higher plans. Document it once the behavior and the plans that include it are confirmed. -->

<h2>The organization URL</h2>
<p>Organization and brand names appear in the address:
<code>app.genfeed.ai/{orgSlug}/{brandSlug}/...</code>. Organization-wide
settings live under <code>/{orgSlug}/~/settings</code>. Only the organization
owner can change the organization's name and handle, under
<strong>Settings &rarr; General</strong>.</p>

<h2>Create another organization</h2>
<ol>
  <li>Open the organization switcher in the top bar.</li>
  <li>Choose <strong>New Organization</strong>.</li>
  <li>Fill in <strong>Name</strong>, <strong>Website</strong> and
  <strong>Description</strong>.</li>
</ol>
<p>The new organization is "a new workspace with a default brand." Use the
switcher at any time to move between organizations; each has a settings shortcut
in the same menu.</p>

<h2>How many organizations you can have</h2>
<p>The number of organizations depends on your plan. At the time of writing,
Pay As You Go includes one organization, and Agencies allows
more than one. Creating an organization also requires an active subscription.
Check <a href="${SITE}/pricing">genfeed.ai/pricing</a> for current terms.</p>

<h2>Organizations vs brands</h2>
<p>Use one organization per company or client account, and one brand per voice
or product line inside it. Brands share the organization's members, credits and
API keys but keep their own voice, accounts and publishing rules. Members can be
limited to specific brands.</p>

<h2>Self-hosted deployments</h2>
<p>A self-hosted Genfeed has exactly one organization and no organization
switcher. Multiple isolated organizations are a Cloud feature. See
<a href="${articleUrl(SLUGS.cloudVsSelfHosted)}">Genfeed Cloud vs self-hosted</a>.</p>
${renderRelated([SLUGS.gettingStarted])}
`;

const TEAM = `
<p>Invite colleagues to your organization from the Members page. Each person
gets a role, and can be limited to specific brands.</p>

<h2>Who can invite people</h2>
<p>Only organization <strong>owners</strong> and <strong>admins</strong> see the
invite controls. Everyone else sees the member list without them.</p>

<h2>Invite a member</h2>
<ol>
  <li>Open <strong>Settings</strong>, switch to your organization, and choose
  <strong>Members</strong> (<code>/{orgSlug}/~/settings/members</code>).</li>
  <li>Choose <strong>Invite Member</strong>.</li>
  <li>Enter the person's details and pick a role. The default role is
  <strong>User</strong>.</li>
  <li>Send the invitation. You will see "Invitation sent successfully".</li>
</ol>
<p>Each invitation appears in the <strong>Invitations</strong> table with a
status: <strong>Pending</strong>, <strong>Delivered</strong>,
<strong>Accepted</strong>, <strong>Delivery Failed</strong>,
<strong>Expired</strong> or <strong>Revoked</strong>. Use <strong>Resend
invitation</strong> if it did not arrive, or <strong>Revoke invitation</strong>
to cancel it.</p>

<h2>Roles</h2>
<p>Genfeed defines these roles: <strong>Owner</strong>, <strong>Admin</strong>,
<strong>Creator</strong>, <strong>Analytics</strong> and <strong>User</strong>.
What is confirmed today:</p>
<ul>
  <li><strong>Owner and Admin</strong> can invite members, manage invitations,
  and change organization modules. They always have access to all brands.</li>
  <li><strong>Only an Owner</strong> can grant the Owner role, change an Owner's
  membership, or edit the organization's name and handle.</li>
  <li>Creator, Analytics and User have narrower access to organization settings
  and administrative actions. For example, advertising analytics can be read by
  owners, admins and Analytics members.</li>
</ul>
<!-- TODO(help): publish a full role-by-permission matrix. Permissions are enforced per endpoint with @RolesDecorator and there is no single source. Also confirm the end-user meaning of the "support" role (it exists in MemberRole but has no product surface) before mentioning it. -->

<h2>Limit a member to specific brands</h2>
<p>Owners and admins see <strong>All brands</strong>. For other members, choose
the member in the list to open <strong>Edit Member</strong> and select which
brands they can work in. This keeps agency clients or freelancers inside the
brands they are meant to touch.</p>

<h2>Seats and plans</h2>
<p>On Pay As You Go the workspace is a solo workspace. Genfeed shows "Unlock
team members" with an upgrade link, and invitations stay locked until you move
to a paid plan. At the time of writing, paid plans do not set a fixed seat
limit in the product.
<a href="${SITE}/pricing">genfeed.ai/pricing</a> has the current terms.</p>
<!-- TODO(help): the invite form handles a "seat limit" error by saying credits were deducted for an additional seat. Confirm whether additional seats are charged in credits on any plan before describing seat pricing. -->
<!-- TODO(help): document how to remove a member or change an existing member's role; the Members list exposes Edit Member for brand access but the role-change and removal controls were not verified. -->

<h2>Self-hosted deployments</h2>
<p>A self-hosted Genfeed is a single organization. With the optional login wall
turned on it supports local accounts, but not the multi-organization governance
that Cloud has.</p>
${renderRelated([SLUGS.organizations, SLUGS.settings])}
`;

const SETTINGS = `
<p>Genfeed settings are split into three scopes: your own account, the
organization, and each brand. Use the settings menu to move between them; the
sidebar shows only the pages for the scope you are in. Some pages appear only for
certain roles or plans.</p>

<h2>Personal settings</h2>
<p>Your account, at <code>/settings/personal</code>.</p>
<ul>
  <li><strong>Personal:</strong> your profile.</li>
  <li><strong>Notifications:</strong> what Genfeed notifies you about,
  including product email preferences.</li>
  <li><strong>Progress:</strong> your getting-started checklist and progress.
  </li>
  <li><strong>Help:</strong> getting-started, documentation, workflow-learning,
  changelog, FAQ, community and support links.</li>
  <li><strong>About:</strong> information about Genfeed.</li>
</ul>

<h2>Organization settings</h2>
<p>At <code>/{orgSlug}/~/settings</code>. Opening organization settings lands on
General.</p>
<ul>
  <li><strong>General:</strong> workspace identity. Only the owner can edit the
  organization name and handle.</li>
  <li><strong>Modules:</strong> turn product areas on or off. Owners and admins
  only.</li>
  <li><strong>Preferences:</strong> organization defaults for new work, such as
  default avatar, voice and models.</li>
  <li><strong>Members:</strong> invitations and brand access. See
  <a href="${articleUrl(SLUGS.team)}">Invite your team</a>.</li>
  <li><strong>Brands:</strong> every brand in the organization and where you
  create new ones.</li>
  <li><strong>Models:</strong> the organization's model catalog and defaults for
  the Studio prompt bar.</li>
  <li><strong>Agents:</strong> agent policy, reply style and credit governance.
  </li>
  <li><strong>Memory:</strong> shared brand memories, on Cloud. Owners and
  admins only.</li>
  <li><strong>Credits</strong>, <strong>Subscription</strong> and
  <strong>Usage:</strong> balance, plan and cost reporting. See
  <a href="${articleUrl(SLUGS.credits)}">How credits and billing work</a>.</li>
  <li><strong>Referrals:</strong> a referral link that earns credits when people
  you refer buy credits.</li>
  <li><strong>API Keys:</strong> keys for the REST API and MCP. API access is
  available on paid plans.</li>
  <li><strong>Integrations:</strong> your own provider keys (BYOK), not
  Genfeed API keys.</li>
  <li><strong>Webhooks:</strong> outbound event notifications.</li>
</ul>
<!-- TODO(help): write one sentence on what each organization page controls once copy exists. Preferences, Modules and Agents were summarized from their component names and menu comments rather than from their full UI. -->

<h2>Brand settings</h2>
<p>At <code>/{orgSlug}/{brandSlug}/settings</code>, for the brand you have
selected.</p>
<ul>
  <li><strong>Brand profile:</strong> the public-facing identity: banner, logo
  and links.</li>
  <li><strong>Brand Kit:</strong> visual identity, writing voice and strategy.
  </li>
  <li><strong>Knowledge:</strong> saved sources generations can cite.</li>
  <li><strong>Connected accounts:</strong> the channels this brand publishes to.
  </li>
  <li><strong>Agent settings:</strong> what the agent is given about the brand.
  </li>
  <li><strong>Publishing:</strong> posting schedule, auto-publish and the
  approval gate.</li>
  <li><strong>Skills:</strong> skills enabled for the brand.</li>
  <li><strong>Usage:</strong> credit usage for this brand.</li>
</ul>
<p>Details for the main brand pages are in
<a href="${articleUrl(SLUGS.brand)}">Brand setup and brand memory</a>,
<a href="${articleUrl(SLUGS.connectAccounts)}">Connect your social accounts</a>
and <a href="${articleUrl(SLUGS.approvalQueue)}">The approval queue</a>.</p>

<h2>Credentials and security</h2>
<p>Provider keys and social credentials are secrets. Add them only through the
Integrations and Connected accounts pages, and never paste them into chats,
screenshots or public issues. Report a suspected security problem through the
<a href="https://github.com/genfeedai/genfeed.ai/security/policy">Security
Policy</a>.</p>
<!-- TODO(help): document two-factor authentication, session management, data export and account deletion only if and when the app ships UI for them. Nothing here promises them. -->
${renderRelated([SLUGS.organizations, SLUGS.gettingStarted])}
`;

const BRAND = `
<p>A brand is the context Genfeed writes and generates inside. Everything you
create is made for one brand, and the agent reads that brand's voice, visuals
and saved memories each time it works. This article covers setting a brand up
and how its memory behaves.</p>

<h2>Create a brand</h2>
<p>New accounts create their first brand during onboarding: enter your
<strong>Website URL</strong>, choose <strong>Scan website</strong>, then
<strong>Review and approve your brand guide</strong>. To add more brands later,
open <strong>Settings &rarr; Brands</strong> in your organization and create
one from there. Creating a brand does not require a new organization.</p>

<h2>Brand Kit</h2>
<p>Open the brand's settings and choose <strong>Brand Kit</strong>
(<code>/{orgSlug}/{brandSlug}/settings/brand-kit</code>). It has four tabs:</p>
<ul>
  <li><strong>Overview:</strong> a summary of the kit.</li>
  <li><strong>Visual identity:</strong> colors, fonts, logo, reference images
  and watermark.</li>
  <li><strong>Writing voice:</strong> tone, style, audience, values, messaging
  pillars, what not to sound like, and sample output.</li>
  <li><strong>Strategy:</strong> content types, platforms, goals and
  frequency.</li>
</ul>
<p>You can fill the kit three ways: scan your website, answer the guided
interview, or write it by hand. <strong>Content rules &amp; examples</strong>
holds guidance such as writing rules and banned phrases.</p>

<h2>The guided interview</h2>
<p>For a brand with gaps in identity, voice or strategy, choose
<strong>Guided setup</strong> in Brand Kit and then <strong>Start
interview</strong>. It asks one question at a time across positioning,
identity, strategy and voice. The screen states "New interview: 10 credits.
Resume is free." You can also run the interview from agent chat with
<code>/interview</code>.</p>

<h2>Brand memory</h2>
<p>Brand memory is what the agent remembers about a brand between chats. Two
kinds reach the agent:</p>
<ul>
  <li><strong>Saved memories.</strong> Ask the agent to remember a preference
  and it is saved to the brand.</li>
  <li><strong>Performance insights.</strong> Once published posts collect
  analytics, Genfeed adds what is working to the brand's context.</li>
</ul>
<p>To see exactly what the agent is given, open the brand's
<strong>Agent settings</strong> and then <strong>Agent context</strong>
(<code>/{orgSlug}/{brandSlug}/settings/agent/context</code>). It lists the
same context a chat turn uses: identity, voice, strategy, visual identity,
guidelines, injected memories, performance insights, retrieved knowledge and
active skills. Brand context is capped so it never crowds out the conversation,
and the page shows what was trimmed. From there, <strong>View memories</strong>
opens your memories and <strong>Run interview</strong> starts the interview.</p>
<!-- TODO(help): describe how to edit or delete individual saved memories (the page shows personal memories can be archived) and what the organization-level Memory settings page governs. The raw BrandMemory rows are not directly editable on one page. -->

<h2>Knowledge sources</h2>
<p><strong>Knowledge</strong> is separate from memory: it holds saved sources,
such as documents and pages, that generations can retrieve and cite. Add them
under the brand's <strong>Knowledge</strong> settings; the agent context page
shows which ones a message would pull in.</p>

<h2>Tips</h2>
<ul>
  <li>Run the website scan first, then edit. It is faster than starting blank.
  </li>
  <li>Be specific in <strong>Writing voice</strong>: "avoid sounding like"
  entries and sample output change results more than adjectives do.</li>
  <li>Check Agent context after big edits to confirm the change reached the
  agent.</li>
</ul>
${renderRelated([SLUGS.connectAccounts, SLUGS.studio, SLUGS.settings])}
`;

const CONNECT_ACCOUNTS = `
<p>Connected accounts are the channels a brand publishes to. Connections belong
to a brand, so each brand can publish to its own accounts.</p>

<h2>Connect an account</h2>
<ol>
  <li>Select your brand, then open its settings and choose
  <strong>Connected accounts</strong>
  (<code>/{orgSlug}/{brandSlug}/settings/connected-accounts</code>).</li>
  <li>Choose <strong>Connect account</strong>.</li>
  <li>Search or browse the platform list, grouped as <strong>Social
  networks</strong>, <strong>Video</strong>, <strong>Communities</strong>,
  <strong>Creator</strong> and <strong>Advertising</strong>.</li>
  <li>Approve access on the platform's own sign-in screen. You return to
  Genfeed when it finishes.</li>
</ol>
<p>For Twitter, Instagram, TikTok, YouTube and LinkedIn, Genfeed first asks
<strong>Import existing posts?</strong> Choose <strong>Import posts</strong> to
bring in the account's recent post history, or <strong>Skip</strong>.</p>

<h2>Platforms you can connect</h2>
<p>The connect dialog offers: Twitter, Instagram, Facebook, LinkedIn, Threads,
YouTube, TikTok, Restream and Fanvue, plus Meta Ads and Google Ads for
advertising. Threads shows "Not available yet" until it is ready on the
server.</p>

<h2>What you can schedule</h2>
<p>Connecting an account and scheduling to it are separate. Scheduled
publishing is supported for <strong>YouTube</strong>, <strong>TikTok</strong>,
<strong>Instagram</strong>, <strong>X (Twitter)</strong> and
<strong>LinkedIn</strong>. Facebook and Threads can be connected, but are not
available as scheduling destinations today.</p>
<!-- TODO(help): confirm what Restream, Fanvue, Meta Ads and Google Ads connections are used for in the product, and whether Facebook or Threads publish by any other path. They are connectable but absent from the scheduler channel catalog. -->
<!-- TODO(help): Beehiiv, Ghost, WordPress, Medium and Dev.to are marked "supported" in the scheduler channel catalog and have API connect controllers, but are not in the Connect account dialog. Document how a user connects them, or leave them out. -->

<h2>Check status, reconnect or disconnect</h2>
<p>The accounts table lists each <strong>Account</strong>, its
<strong>Platform</strong>, <strong>Status</strong> and <strong>Actions</strong>.
An account shows <strong>Connected</strong>, or <strong>Needs reconnect</strong>
when the platform has revoked or expired the authorization. Choose
<strong>Reconnect</strong> for the account to authorize it again, or
<strong>Disconnect account</strong> to remove it. Each account also has a
settings dialog with <strong>Health</strong>, <strong>Import</strong> and
<strong>Posting times</strong>.</p>
<!-- TODO(help): explain the "Scheduled publishing is held for warmup" notice and its "Override 24h" action: which accounts it applies to and why. -->

<h2>Who can connect accounts</h2>
<p>Connecting uses the signed-in person's access to the platform account. Members
need access to the brand to see its connected accounts.</p>
<!-- TODO(help): confirm which organization roles may connect and disconnect accounts. No role guard was found in the connect UI. -->

<h2>Troubleshooting</h2>
<ul>
  <li><strong>Needs reconnect:</strong> reconnect the account; the platform
  expired or revoked the token.</li>
  <li><strong>The platform is missing:</strong> it is not offered yet; see the
  list above.</li>
  <li><strong>Posts are not going out:</strong> check the brand's Publishing
  settings. With the approval gate on, nothing publishes until you approve it.
  See <a href="${articleUrl(SLUGS.approvalQueue)}">The approval queue</a>.</li>
</ul>
${renderRelated([SLUGS.gettingStarted, SLUGS.brand, SLUGS.approvalQueue])}
`;

const APPROVAL_QUEUE = `
<p>The approval queue is where generated drafts wait for a person to decide
before anything is published. It lists drafts from generated batches that are
waiting for a human decision, and lets you approve, reject, or send them back
with notes.</p>

<h2>Open the queue</h2>
<p>Go to <strong>Publishing &rarr; Posts</strong> and switch the view to
<strong>Approvals</strong>
(<code>/{orgSlug}/{brandSlug}/publishing/posts?view=approvals</code>). The
<strong>Approval queue</strong> opens on items that are <strong>Ready</strong>.
Items waiting for review also appear on the home screen under
<strong>Attention queue</strong>, with <strong>Approve</strong> and
<strong>Open queue</strong> shortcuts. When nothing needs a decision it reads
"Nothing is waiting for review."</p>

<h2>Filter by status</h2>
<p>Use the status filter to show <strong>Ready</strong>,
<strong>Pending</strong>, <strong>Approved</strong>, <strong>Changes</strong>,
<strong>Failed</strong>, <strong>Skipped</strong> or <strong>All
statuses</strong>.</p>

<h2>Make a decision</h2>
<p>Select an item to see its preview and the <strong>Decision</strong> panel:
"Approve, request changes, or reject this post." Add context in the
<strong>Revision guidance or rejection context</strong> box, then choose:</p>
<ul>
  <li><strong>Approve and schedule</strong>, or <strong>Approve and open
  draft</strong> for an item that already has a post but no schedule.</li>
  <li><strong>Request changes</strong> to send it back with your notes.</li>
  <li><strong>Reject</strong> to decline it.</li>
</ul>
<p>To handle several at once, choose <strong>Add to bulk selection</strong> on
each item. You can also discard a whole batch with <strong>Discard
batch</strong>.</p>

<h2>Turn the approval gate on or off</h2>
<p>Open the brand's <strong>Publishing</strong> settings
(<code>/{orgSlug}/{brandSlug}/settings/publishing</code>). While
<strong>Auto-publish</strong> is off, the page shows <strong>You have the final
say</strong>: nothing publishes without your approval. Turning on Auto-publish
removes that gate, and approved output publishes automatically once its
confidence clears the <strong>Confidence threshold</strong> you set.</p>
<p>Agents you automate have their own publishing controls, including an option
to allow automatic publishing when policy checks pass.</p>
<!-- TODO(help): confirm which organization roles can approve items. No role guard was found in the review UI, and the API relies on organization and brand access only. -->
<!-- TODO(help): confirm whether posts drafted by hand, or by an agent over MCP, are routed into this queue. Over MCP, publishing tools return an "approval pending" result that points here, per api-reference/mcp. -->

<h2>Review from your editor</h2>
<p>When you connect Claude Code or Cursor to Genfeed, drafts are held for review
before anything publishes. See
<a href="${articleUrl(SLUGS.mcp)}">Connect Claude Code or Cursor</a>.</p>
${renderRelated([SLUGS.connectAccounts, SLUGS.brand, SLUGS.team])}
`;

const STUDIO = `
<p>Studio is where you generate images, video and other media from a prompt,
using your brand's context. This article covers the Playground, which is the
main place to generate.</p>

<h2>Open the Playground</h2>
<p>Select your brand, open <strong>Studio</strong>, then
<strong>Playground</strong>
(<code>/{orgSlug}/{brandSlug}/studio/playground</code>). It is described as one
prompt bar for every asset type, enriched with your brand. Everything you
generate appears on the page.</p>

<h2>Generate something</h2>
<ol>
  <li>Choose the <strong>Generation type</strong>: <strong>Image</strong>,
  <strong>Edit image</strong>, <strong>Video</strong>, <strong>Music</strong>,
  <strong>Avatar</strong> or <strong>Voice</strong>.</li>
  <li>Write your <strong>Prompt</strong>. Choose <strong>Enhance
  prompt</strong> to have Genfeed expand it.</li>
  <li>Set options such as <strong>Aspect ratio</strong>, <strong>Duration</strong>
  for video, <strong>Brand</strong> and <strong>Brand voice</strong>.</li>
  <li>Leave <strong>Model</strong> on <strong>Auto</strong>, or open
  <strong>Advanced</strong> to choose the model yourself.</li>
  <li>Check the cost estimate, then choose <strong>Generate</strong>.</li>
</ol>

<h2>Use references</h2>
<p>Image and video generation accept references. For video you can add a
<strong>Start Frame</strong>, an <strong>End Frame</strong> or a <strong>Video
Reference</strong>. Some model combinations conflict, and Studio explains when
they do; for example, one model uses frames or a video reference but not both.
Choose <strong>Use as reference</strong> on a result to build on it.</p>
<!-- TODO(help): list which models support which reference types. These change with the model catalog; the app shows the conflicts inline, so none are listed here. -->

<h2>What it costs</h2>
<p>Studio shows <strong>Estimated</strong> credits before you generate, and for
video it factors in clip length. With your own provider key it shows
<strong>Your API key &middot; 0 credits</strong>. The balance available to you is
shown beside the prompt. See
<a href="${articleUrl(SLUGS.credits)}">How credits and billing work</a>.</p>

<h2>After you generate</h2>
<p>Results are saved to your library as assets. From a result you can
<strong>Use in post</strong>, <strong>Remix</strong> or <strong>Vary</strong>
it, and <strong>Move to Trash</strong> when you no longer need it.</p>

<h2>Other Studio tools</h2>
<p>Studio also includes storyboard runs, clips, turbo projects, motion
compositions and a timeline editor. Administrators can switch individual
surfaces on or off, so you may see only some of them.</p>
<!-- TODO(help): write a short guide for each secondary Studio tool (storyboard, clips, turbo, motion, editor) once their flows are confirmed. -->

<h2>Studio from your editor</h2>
<p>Claude's connector creates drafts, schedules and reads analytics, but image,
video and audio creation stay in Studio. Cursor's connection includes
generation tools. See
<a href="${articleUrl(SLUGS.mcp)}">Connect Claude Code or Cursor</a>.</p>
${renderRelated([SLUGS.brand, SLUGS.approvalQueue])}
`;

const MCP = `
<p>Genfeed Cloud runs a hosted MCP server at <code>mcp.genfeed.ai</code>, so your
editor's agent can read your brands, draft posts, schedule releases and check
analytics without leaving the editor. You sign in with your Genfeed account in a
browser; there is nothing to install on a server and you do not paste an API key.</p>

<h2>Before you start</h2>
<ul>
  <li>A Genfeed Cloud account. Creating one is free; metered work follows your
  plan. See <a href="${articleUrl(SLUGS.credits)}">How credits and billing work</a>.</li>
  <li>At least one brand. See
  <a href="${articleUrl(SLUGS.brand)}">Brand setup and brand memory</a>.</li>
  <li>Claude Code or Cursor.</li>
</ul>

<h2>Connect Claude Code</h2>
<p>Run this in your terminal:</p>
<pre><code>claude mcp add --transport http genfeed --scope user https://mcp.genfeed.ai/mcp/claude</code></pre>
<p>Then open <code>/mcp</code> inside Claude Code, select <strong>genfeed</strong>
and choose to authenticate. Sign in and approve access in your browser, then
return to Claude Code. Check the result with:</p>
<pre><code>claude mcp list</code></pre>
<p>Ask Claude Code to list your Genfeed brands to confirm it works. Genfeed
also publishes a Claude Code plugin with the Genfeed playbook:
<code>/plugin install genfeed --marketplace genfeedai/agent</code>.</p>
<!-- TODO(help): confirm the minimum Claude Code version for the plugin command (the setup prompt says 2.1.275 or newer) before stating one. -->

<h2>Connect Cursor</h2>
<p>Open the install link on <a href="${SITE}/cursor">genfeed.ai/cursor</a>,
confirm the Genfeed MCP server in Cursor, and sign in with Genfeed OAuth. To add
it by hand, put this in your Cursor <code>mcp.json</code>:</p>
<pre><code>{
  "mcpServers": {
    "genfeed": {
      "url": "https://mcp.genfeed.ai/mcp"
    }
  }
}</code></pre>
<!-- TODO(help): the Cursor mcp.json wrapper (mcpServers) follows Cursor's documented format; Genfeed's own install link encodes only {"url": ...}. Re-verify against Cursor's docs. -->

<h2>What the consent screen asks</h2>
<p>The browser shows <strong>Authorize Genfeed access</strong>. Sign in or create
an account, pick the organization the client may use, review the scopes, then
choose <strong>Authorize</strong> or <strong>Deny</strong>. The requested scopes
cover videos, images, prompts, articles, post drafts, post scheduling, publish
approvals, brands, credits and analytics. Direct publishing is not part of the
standard set. Access is limited to the Genfeed MCP resource, and you can revoke
it from <strong>Settings &rarr; API Keys</strong>.</p>

<h2>Two endpoints, different tools</h2>
<ul>
  <li><code>https://mcp.genfeed.ai/mcp/claude</code> is the Claude connector. It
  manages brands, drafts, scheduling and analytics. Image, video and audio
  creation stay in <a href="${articleUrl(SLUGS.studio)}">Studio</a>.</li>
  <li><code>https://mcp.genfeed.ai/mcp</code> is the standard endpoint that
  Cursor uses. Its default tool set covers account and brand lookups, content,
  generation and scheduling.</li>
</ul>
<p>You can narrow the standard endpoint to specific tool sets with a
<code>toolsets</code> query parameter, for example
<code>https://mcp.genfeed.ai/mcp?toolsets=content,generation,analytics,brand,scheduler</code>.
The core tools are always included.</p>
<!-- TODO(help): the MCP docs say the default profile is capped at 26 tools while toolset-profiles.ts sets BARE_MCP_URL_TOOL_CAP = 27. No count is stated here. Reconcile and update api-reference/mcp.mdx. -->

<h2>Review and credits</h2>
<p>Genfeed holds drafts for review before anything publishes; publishing tools
return an "approval pending" result and the item waits in the
<a href="${articleUrl(SLUGS.approvalQueue)}">approval queue</a>. Actions that
generate media or otherwise use metered work draw on your organization's credits
like they would in the app, and can return an insufficient-credits or
plan-required error.</p>
<!-- TODO(help): confirm whether MCP access via OAuth is available on the Pay As You Go plan. API-key access is a paid-plan feature, but the OAuth path was not checked against plan gating. -->

<h2>Troubleshooting</h2>
<ul>
  <li><strong>genfeed is not listed in <code>/mcp</code>:</strong> re-run the
  <code>claude mcp add</code> command and check that its scope matches where you
  are running Claude Code.</li>
  <li><strong>Authorization was denied or expired:</strong> restart the
  authorization flow from your client, and approve access in the browser.</li>
  <li><strong>Self-hosting?</strong> Your MCP server runs on your own host. See
  <a href="${articleUrl(SLUGS.cloudVsSelfHosted)}">Genfeed Cloud vs self-hosted</a>.</li>
</ul>
<p>More client guides: <a href="${SITE}/claude-code">Claude Code</a>,
<a href="${SITE}/cursor">Cursor</a>, and <a href="${SITE}/agent">all agent
clients</a>.</p>
${renderRelated([SLUGS.gettingStarted, SLUGS.settings])}
`;

const CLOUD_VS_SELF_HOSTED = `
<p>Genfeed ships as a hosted product, Genfeed Cloud, and as a self-hosted
Community edition. They run the same codebase, which is open source under
AGPL-3.0, but they differ in who operates it and what is available out of the
box.</p>

<h2>At a glance</h2>
<table>
  <thead>
    <tr><th>Topic</th><th>Genfeed Cloud</th><th>Community self-hosted</th></tr>
  </thead>
  <tbody>
    <tr><td><strong>Who runs it</strong></td><td>Genfeed operates the service at
    <a href="${APP}">app.genfeed.ai</a></td><td>You run Docker, storage,
    backups and updates</td></tr>
    <tr><td><strong>Organizations</strong></td><td>Multiple isolated
    organizations, with an organization switcher</td><td>One organization per
    deployment</td></tr>
    <tr><td><strong>Brands</strong></td><td>Many per organization</td><td>Many
    </td></tr>
    <tr><td><strong>Sign-in</strong></td><td>Email and password, magic link, or
    Google</td><td>No login by default; an optional login wall adds local
    accounts</td></tr>
    <tr><td><strong>Generation</strong></td><td>Managed models paid with
    credits; your own provider keys on paid plans</td><td>Your own provider keys;
    no Genfeed credits</td></tr>
    <tr><td><strong>Credits and plans</strong></td><td>Organization billing and
    subscriptions</td><td>No billing locally; managed credits can be bought on
    Cloud and used through the API</td></tr>
    <tr><td><strong>Storage</strong></td><td>Managed by Genfeed</td><td>Local
    filesystem and your own PostgreSQL</td></tr>
    <tr><td><strong>Team governance</strong></td><td>Members, roles and
    invitations per organization</td><td>Single-tenant account
    controls</td></tr>
    <tr><td><strong>API and MCP</strong></td><td>REST and MCP at
    <code>api.genfeed.ai</code> and <code>mcp.genfeed.ai</code></td><td>REST and
    MCP on your own host</td></tr>
    <tr><td><strong>Support</strong></td><td>Contact Genfeed; terms depend on your
    plan</td><td>Community channels on GitHub</td></tr>
  </tbody>
</table>
<!-- TODO(help): fill in publishing and analytics parity. The retired docs page claimed "managed connectors where supported" and "managed cross-workflow analytics" for Cloud and "manual export" for Community, but the code gates neither on deployment mode beyond credentials and billing, so no claim is made. -->

<h2>Choose Genfeed Cloud when</h2>
<ul>
  <li>You want to start now without operating servers.</li>
  <li>Several people or clients need isolated workspaces.</li>
  <li>You want managed models and one bill, instead of managing provider
  accounts.</li>
</ul>
<p>Start at <a href="${APP}/sign-up">app.genfeed.ai/sign-up</a> or follow
<a href="${articleUrl(SLUGS.gettingStarted)}">Getting started with Genfeed
Cloud</a>. See <a href="${SITE}/pricing">pricing</a> for plans.</p>

<h2>Choose self-hosting when</h2>
<ul>
  <li>Data and infrastructure must stay on machines you control.</li>
  <li>You are happy to bring your own provider keys and pay providers directly.
  </li>
  <li>One organization is enough, or you are evaluating the product.</li>
</ul>
<p>Install instructions are in the
<a href="https://docs.genfeed.ai/self-host/installation">self-host
documentation</a>, and
<a href="${SITE}/self-hosted">genfeed.ai/self-hosted</a> summarizes what you
get. The fastest start is one command:</p>
<pre><code>npx @genfeedai/create my-genfeed</code></pre>

<h2>Costs</h2>
<p>Self-hosting costs your infrastructure plus whatever your model providers
charge. Cloud prices, included credits and support terms are on
<a href="${SITE}/pricing">genfeed.ai/pricing</a>. Neither edition promises a
support response time in the repository.</p>

<h2>Moving between them</h2>
<p>A self-hosted instance does not automatically sync to Cloud. A Cloud API key
authorizes only the calls you make to Cloud, such as managed inference. There is
no assumed complete migration path for workflows, brands, templates or assets in
either direction, so check export and import support for each resource before
planning a move.</p>
<!-- TODO(help): document concrete export/import paths per resource once they exist. -->

<h2>Data and providers</h2>
<p>When a self-hosted install uses an external model provider, prompts and media
leave your deployment under that provider's terms. Keeping everything local
requires local model infrastructure as well.</p>
${renderRelated([SLUGS.organizations, SLUGS.credits, SLUGS.mcp])}
`;

const PUBLISHED_AT = [
  '2026-10-15T09:10:00.000Z',
  '2026-10-15T09:09:00.000Z',
  '2026-10-15T09:08:00.000Z',
  '2026-10-15T09:07:00.000Z',
  '2026-10-15T09:06:00.000Z',
  '2026-10-15T09:05:00.000Z',
  '2026-10-15T09:04:00.000Z',
  '2026-10-15T09:03:00.000Z',
  '2026-10-15T09:02:00.000Z',
  '2026-10-15T09:01:00.000Z',
  '2026-10-15T09:00:00.000Z',
] as const;

export const HELP_ARTICLES: readonly HelpSeedArticle[] = [
  {
    category: ArticleCategory.HELP,
    content: GETTING_STARTED,
    label: LABELS[SLUGS.gettingStarted],
    publishedAt: PUBLISHED_AT[0],
    slug: SLUGS.gettingStarted,
    summary:
      'Create your Genfeed Cloud account, set up a brand, connect a channel, and publish or schedule your first post.',
  },
  {
    category: ArticleCategory.HELP,
    content: CREDITS_AND_BILLING,
    label: LABELS[SLUGS.credits],
    publishedAt: PUBLISHED_AT[1],
    slug: SLUGS.credits,
    summary:
      'Where to see your credit balance, what spends credits, how agent chat is billed, and how to add credits or manage your plan.',
  },
  {
    category: ArticleCategory.HELP,
    content: ORGANIZATIONS,
    label: LABELS[SLUGS.organizations],
    publishedAt: PUBLISHED_AT[2],
    slug: SLUGS.organizations,
    summary:
      'What an organization contains, how brands fit inside it, how to create and switch organizations, and the limits on each plan.',
  },
  {
    category: ArticleCategory.HELP,
    content: TEAM,
    label: LABELS[SLUGS.team],
    publishedAt: PUBLISHED_AT[3],
    slug: SLUGS.team,
    summary:
      'Invite members, understand Owner, Admin and other roles, track invitations, and limit people to specific brands.',
  },
  {
    category: ArticleCategory.HELP,
    content: SETTINGS,
    label: LABELS[SLUGS.settings],
    publishedAt: PUBLISHED_AT[4],
    slug: SLUGS.settings,
    summary:
      'A map of personal, organization and brand settings in Genfeed Cloud, and which pages need which role or plan.',
  },
  {
    category: ArticleCategory.HELP,
    content: BRAND,
    label: LABELS[SLUGS.brand],
    publishedAt: PUBLISHED_AT[5],
    slug: SLUGS.brand,
    summary:
      'Set up a brand from your website, shape its voice in Brand Kit, and see what the agent remembers about it.',
  },
  {
    category: ArticleCategory.HELP,
    content: CONNECT_ACCOUNTS,
    label: LABELS[SLUGS.connectAccounts],
    publishedAt: PUBLISHED_AT[6],
    slug: SLUGS.connectAccounts,
    summary:
      'Connect a brand to your social channels, see which platforms Genfeed can schedule to, and fix a connection that needs reconnecting.',
  },
  {
    category: ArticleCategory.HELP,
    content: APPROVAL_QUEUE,
    label: LABELS[SLUGS.approvalQueue],
    publishedAt: PUBLISHED_AT[7],
    slug: SLUGS.approvalQueue,
    summary:
      'Review generated drafts before they publish: approve, reject or request changes, and control the approval gate.',
  },
  {
    category: ArticleCategory.HELP,
    content: STUDIO,
    label: LABELS[SLUGS.studio],
    publishedAt: PUBLISHED_AT[8],
    slug: SLUGS.studio,
    summary:
      'Generate images and video in the Studio Playground: pick a type and model, add references, check the cost, and reuse results.',
  },
  {
    category: ArticleCategory.HELP,
    content: MCP,
    label: LABELS[SLUGS.mcp],
    publishedAt: PUBLISHED_AT[9],
    slug: SLUGS.mcp,
    summary:
      'Add the hosted Genfeed MCP server to Claude Code or Cursor with browser sign-in, then draft and schedule from your editor.',
  },
  {
    category: ArticleCategory.HELP,
    content: CLOUD_VS_SELF_HOSTED,
    label: LABELS[SLUGS.cloudVsSelfHosted],
    publishedAt: PUBLISHED_AT[10],
    slug: SLUGS.cloudVsSelfHosted,
    summary:
      'How hosted Genfeed Cloud and the self-hosted Community edition differ in operations, tenancy, billing, generation and support.',
  },
];
