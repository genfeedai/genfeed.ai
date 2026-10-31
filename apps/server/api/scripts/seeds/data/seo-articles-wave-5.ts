/**
 * B2B playbook articles. Hand-authored step-by-step guides rather than
 * `buildSeoArticle` briefs: the shared builder's comparison shell does not suit
 * a numbered, day-by-day playbook. `content` is sanitized HTML (see the note
 * in `launch-articles.ts`). Each article ends with the done-for-you section;
 * keep its price and scope wording aligned with
 * `apps/marketing/src/components/landing/service-offering.data.ts`.
 */

import { ArticleCategory } from '@genfeedai/contracts';
import { articleArtwork } from './article-artwork';
import type { SeedArticle } from './launch-articles';

const DONE_FOR_YOU_PRICING = `
<p>Genfeed's done-for-you service is built for exactly this. Our team plans,
produces, and publishes your content and tests it against your best ads. You
approve what goes out. Pricing starts from $2,500/month, with usage billed at
cost and a performance fee per contract on winning creatives. The scope is agreed
on a call, so you only pay for the channels and volume you need.</p>

<p><a href="https://genfeed.ai/done-for-you"><strong>Book a call for done-for-you
B2B content</strong></a></p>
`;

const START_B2B_CONTENT = `
<p>Starting B2B content is one of the most discussed and most misunderstood jobs
in marketing. Almost every founder and sales lead knows they should be doing it.
Fewer know what to publish first, who it should be for, or how to tell in a month
whether it is working.</p>

<p>This guide covers all of it: what B2B content actually is, why most of it is
ignored, the day-by-day process for your first 30 days, the mistakes that undo
progress, and when it makes sense to run it yourself versus hand it to a service.</p>

<h2>What is B2B content?</h2>

<p>B2B content is anything you publish to help a specific kind of business buyer
make progress on a specific problem, before they are ready to talk to you. A
post that explains how to run a quarterly pricing review is B2B content. A post
announcing that your product now has a dashboard is advertising.</p>

<p>In practice, a working B2B content program looks like this: instead of posting
whatever the team happens to have, you decide who the content is for, you collect
the questions that buyer actually asks, and you answer them in public on a fixed
schedule. By the time someone reaches your sales call, they have already seen you
explain the problem several times, and they arrive with a view of how you think.</p>

<h2>Why most B2B content gets ignored</h2>

<p>There is far more content published than any buyer can read. A reader decides
in a line or two whether a post is for them, and they decide on specificity. Most
company content fails that test because it is written for no one in particular.</p>

<h3>The in-market problem</h3>

<p>Most of the people who could buy from you are not shopping today. A widely cited
heuristic, often called the 95:5 rule, says only about 5% of buyers in a category
are in market at any moment. Its originators describe the figure as a rough
guide rather than a measurement, and the real ratio depends on how often your
category is bought. The practical point holds anyway: content has two jobs. It
should be useful enough that the other 95% remember you, and specific enough that
the few in market recognise their problem in it.</p>

<h3>The buying committee problem</h3>

<p>B2B purchases tend to involve several people, and the person who reads your
post is rarely the only one who decides. That is a judgment from selling to teams,
not a statistic, but it shapes the advice below: write for the person who feels
the problem, and make the post easy to forward to the person who owns the
budget.</p>

<h2>Does B2B content actually work?</h2>

<p>Yes, with two honest caveats. It works through repetition: a buyer who sees the
same clear point from you across several weeks is far more likely to reply than
one who sees a single post. And it works best where the purchase is considered
and the sale is large enough that trust matters, such as software, services, and
anything sold to a team.</p>

<p>It does not work as a way to fill the pipeline in 30 days. If you need meetings
this month, outbound is the faster tool. Content is what makes outbound replies
more likely next quarter, because the person you contact has already heard of you.</p>

<h2>How long before it pays off?</h2>

<p>The honest answer is: longer than most people want to wait, and less than most
guides suggest. Give yourself 30 days to set up and prove the loop, and judge the
results after about 90.</p>

<table>
  <thead><tr><th>Period</th><th>Goal</th><th>What you should have</th></tr></thead>
  <tbody>
    <tr><td><strong>Days 1 to 7</strong></td><td>Set up</td><td>Buyer sentence, brief, source library, first three posts live</td></tr>
    <tr><td><strong>Days 8 to 14</strong></td><td>Find your angle</td><td>Three posts per pillar; notes on which draw replies</td></tr>
    <tr><td><strong>Days 15 to 21</strong></td><td>Add proof</td><td>One customer story or worked example; daily engagement habit</td></tr>
    <tr><td><strong>Days 22 to 30</strong></td><td>Review and decide</td><td>Scorecard, keep or cut each format, plan for month two</td></tr>
    <tr><td><strong>Days 31 to 90</strong></td><td>Compound</td><td>Same loop, one change at a time; first pipeline you can attribute</td></tr>
  </tbody>
</table>

<p>What to avoid: the common mistake of publishing hard for one week and then
stopping. It is worse than not starting, because you spend the setup cost and
collect none of the repetition.</p>

<h2>The 30-day B2B content playbook</h2>

<p>The goal at each stage is to look like a specialist who has useful things to
say about one problem, not a company that has decided to start a content program.</p>

<h3>Before you do anything: set up the foundation</h3>

<p>The foundation matters more than most guides admit. Spend your first
afternoon on these four things, in this order.</p>

<ol>
  <li><strong>Pick one buyer and one problem.</strong> Write a sentence in this
  shape: "We help [a specific role at a specific kind of company] do [one concrete
  job] without [the pain they currently put up with]." "Marketing leaders" is not
  a role. "Heads of marketing at 20 to 200 person software companies" is. If you
  cannot name three real people who fit it, it is still too broad.</li>
  <li><strong>Write your position and voice.</strong> Capture what you believe that
  most of your category does not, what you will not say, how you sound (three
  adjectives and two example sentences), and what proof you can show. Keep it where
  your tools can read it. In Genfeed this lives in brand setup and brand memory, so
  every draft starts from the same voice.</li>
  <li><strong>Build a source library.</strong> Collect the questions buyers ask in
  the first ten minutes of sales calls, the objections that come up late, where new
  customers get stuck, and the real reasons deals were lost. Sort them into
  questions, objections, stories, and opinions.</li>
  <li><strong>Choose one channel and two formats.</strong> Starting on every channel
  is the second most common failure. See the table in the next section.</li>
</ol>

<p>Never publish a customer's words or numbers without their permission.</p>

<h3>Days 1 to 7: ship the first three posts</h3>

<p>Do not wait until the setup feels finished. Publish three posts in the first
week, each built from one question in your source library:</p>

<ul>
  <li>Answer the question in the first two lines, then explain the reasoning.</li>
  <li>Include one specific example, number, or decision that only you could have
  written.</li>
  <li>End with something a reader can do or answer, not a pitch.</li>
  <li>Spend 15 minutes a day replying to every comment and commenting on five posts
  from the buyers you described in the buyer sentence.</li>
</ul>

<h3>Days 8 to 14: cover the three pillars</h3>

<p>Turn your position into three topics you will keep returning to. A workable split
is <strong>teach</strong> (how to do the job), <strong>show</strong> (how you or a
customer did it, with evidence), and <strong>argue</strong> (what you think the
category gets wrong). Publish three posts this week, one per pillar, and note which
draw replies. Replies matter more than likes: they show a reader cared enough to
answer.</p>

<h3>Days 15 to 21: add proof</h3>

<p>This week, publish one customer story or worked example, with permission. A
simple structure: the situation, what was tried, what changed, and what you would do
differently. Send the strongest post of the last two weeks to two or three customers
and ask what they would change. Move good replies into direct messages and offer
help before you offer a call.</p>

<h3>Days 22 to 30: review and decide</h3>

<p>Read the scorecard (see below) and make three decisions: which format to keep,
which to cut, and which topic to double down on. Then plan the second month. Change
one thing at a time so you can tell what caused a difference.</p>

<h2>Choosing your channel</h2>

<p>Pick the one where your buyer already pays attention to peers, then add a second
only when the first runs without strain.</p>

<table>
  <thead><tr><th>Channel</th><th>Best fit</th><th>Trade-off to accept</th></tr></thead>
  <tbody>
    <tr><td><strong>LinkedIn</strong></td><td>Reaching named roles at companies; founder-led and expert-led posting</td><td>Reads as advertising quickly; needs real opinions, not announcements</td></tr>
    <tr><td><strong>Email newsletter</strong></td><td>Owning the relationship with a narrow audience</td><td>Slow to build; needs a steady source of substance</td></tr>
    <tr><td><strong>YouTube or short video</strong></td><td>Products that need to be seen to be understood</td><td>Higher production effort per asset</td></tr>
    <tr><td><strong>Search articles</strong></td><td>Buyers who already search for the problem</td><td>Slowest payback; weak if you cannot say anything new</td></tr>
  </tbody>
</table>

<h2>The scorecard: measure conversations, not applause</h2>

<p>Likes tell you very little in B2B. Track a small scorecard each week:</p>

<ul>
  <li><strong>Reach among the right people</strong>: impressions from your target
  roles, where the platform reports it.</li>
  <li><strong>Replies and saves</strong>: signs that a post was worth acting on.</li>
  <li><strong>Inbound conversations</strong>: direct messages, intro requests, and
  prospects who mention a post in a call.</li>
  <li><strong>Pipeline touched</strong>: opportunities where the buyer engaged with
  your content before or during the sale. Ask in discovery calls: "how did you first
  hear about us?"</li>
  <li><strong>Effort</strong>: hours spent per week, so you can judge whether the
  loop is sustainable.</li>
</ul>

<h2>Mistakes that undo progress</h2>

<p>B2B content rarely fails randomly. The same mistakes show up repeatedly in
programs that stall.</p>

<p><strong>Writing for "decision makers" in general.</strong> A post addressed to
everyone reads as addressed to no one. The buyer sentence in your foundation exists
to stop this.</p>

<p><strong>Opening every post with a product announcement.</strong> Announcements
are useful to people who already care. Everyone else scrolls past, and the account
trains its audience to do that.</p>

<p><strong>Publishing without proof.</strong> A claim with no example, number, or
customer behind it is indistinguishable from the other claims in the feed.</p>

<p><strong>Starting four channels and sustaining none.</strong> Repetition is what
builds recognition. Four thin channels give you no repetition on any of them.</p>

<p><strong>Measuring likes and calling it pipeline.</strong> Likes are cheap.
Conversations and opportunities touched are what the work is for.</p>

<p><strong>Letting generated drafts go out unedited.</strong> Draft tools are good
at structure and speed and poor at your specifics. Edit hard, or the content will
sound like everyone else's.</p>

<h2>Doing it yourself versus using a service</h2>

<p>Everything above describes running one content program. When you are also running
a company, the execution problem changes: the work is a weekly job of briefing,
producing, reviewing, publishing, engaging, and reporting, and the cost of a gap is
that you lose the repetition that made the first weeks worth doing.</p>

<h3>When doing it yourself works</h3>

<p>If you have a clear buyer, a founder or expert who likes to write, and four to
six hours a week to protect, do it yourself. You will learn what your buyers
respond to, and you will brief any provider much better later. Use AI for
structure and variations, and keep the examples and opinions yours. In Genfeed,
drafts wait in an approval queue until someone reviews them, so the last human pass
is not skipped on a busy week.</p>

<h3>Freelancers and tools</h3>

<p>Writers, editors, and scheduling tools take a slice of the job. The overhead moves
to you: someone has to brief them, collect the source material, check the output
against your position, and make sure it ships on time. This works when you have a
person with time to manage it.</p>

<h3>Done-for-you</h3>

<p>When the work is clearly worth doing and the constraint is time or capacity, the
math usually favours handing the whole loop to a service. The cost is fixed and
predictable, and the overhead of keeping a weekly program running, week after
week, without gaps, is what you are buying back.</p>

${DONE_FOR_YOU_PRICING}

<h2>Summary</h2>

<p>B2B content works because buyers make decisions on familiarity and trust, and most
of them are not in market when they first see you. Building that familiarity
deliberately, with one buyer, one problem, and a repeatable set of formats,
gives your sales conversations a head start.</p>

<p>The process is not complicated. The discipline to run it every week, in the same
lane, without shortcuts, is where most teams fall short. For a single program, the
DIY route is entirely viable. For anything beyond that, the operating overhead is
what pushes teams toward a service. Either way, decide the buyer first: formats,
channels, and schedules all work better once that is clear.</p>

<h2>Frequently asked questions</h2>

<h3>How long before B2B content produces leads?</h3>
<p>Expect conversations and replies within the first month if you publish
consistently and engage daily. Pipeline usually lags that, because buyers return
when they are in market. Judge the first 30 days on consistency and conversations,
and judge the next quarter on pipeline touched.</p>

<h3>How many hours a week does this take?</h3>
<p>For three posts a week plus daily engagement, plan on roughly four to six hours
once the brief and source library exist. The first week takes longer because you are
setting up.</p>

<h3>Do I need a blog before I start?</h3>
<p>No. Start where your buyer already is, usually LinkedIn. A blog or newsletter
helps once you have posts that repeatedly draw replies, because then you know which
topics deserve a longer piece.</p>

<h3>Can AI write B2B content?</h3>
<p>It can produce drafts and variations quickly. It cannot supply your position, your
customer stories, or your judgment. Use it for structure and speed, and keep the
specifics and the final edit human.</p>

<h3>When should I hire an agency or use a done-for-you service?</h3>
<p>When the work is clearly worth doing and the constraint is time or capacity. Run
the 30 days yourself first if you can; you will brief any provider far better once
you know your buyer, your angle, and what draws replies.</p>

<h2>Related reading</h2>
<ul>
  <li><a href="https://genfeed.ai/articles/how-to-grow-on-linkedin-with-ai-generated-content">How to grow on LinkedIn with AI-generated content</a></li>
  <li><a href="https://genfeed.ai/articles/brand-setup-and-brand-memory">Brand setup and brand memory</a></li>
  <li><a href="https://genfeed.ai/articles/approval-queue-review-before-publishing">Approval queue: review before publishing</a></li>
  <li><a href="https://genfeed.ai/articles/measure-ai-content-performance-across-social-platforms">Measure AI content performance across social platforms</a></li>
  <li><a href="https://genfeed.ai/founder-content">Genfeed for founder content</a></li>
</ul>

<h2>Sources and further reading</h2>
<p>The 95:5 figure is a heuristic, not a measurement; treat it as a reason to
build memory among buyers who are not shopping yet. The channel and cadence advice
is operating judgment, so test it against your own results.</p>
<ul>
  <li><a href="https://www.marketingweek.com/peter-weinberg-jon-lombardo-95-5-rule" rel="noopener noreferrer">Marketing Week: The 95:5 rule is the new 60:40 rule</a></li>
  <li><a href="https://docs.genfeed.ai/" rel="noopener noreferrer">Genfeed documentation</a></li>
</ul>
`;

const FOUNDER_LED_LINKEDIN = `
<p>Founder-led LinkedIn is one of the most common ways B2B companies start
creating content, and one of the most commonly done badly. The founder posts for
two weeks, gets a handful of likes, and decides LinkedIn does not work for their
market. Usually the problem was not the platform. It was that nothing about the
account told a buyer why to follow it.</p>

<p>This guide covers all of it: what founder-led LinkedIn is, why it works, the
profile and post types that carry it, a day-by-day plan for the first 30 days, the
mistakes that undo progress, and when it makes sense to run it yourself versus have
a team run it for you. If you have not decided who you are writing for, start with
<a href="https://genfeed.ai/articles/how-to-start-b2b-content-playbook">the 30-day
B2B content playbook</a> and come back.</p>

<h2>What is founder-led LinkedIn?</h2>

<p>Founder-led LinkedIn is a content program where a named person at the company,
usually the founder or a senior expert, publishes from their own profile about the
problem the company solves, rather than relying on the company page. The person is
the channel. The company is the proof behind them.</p>

<p>In practice, it looks like this: instead of posting product updates, the founder
answers the questions buyers ask on sales calls, explains decisions they have made,
and takes positions the category disagrees with. Readers follow because they
learn something. When one of them later needs what the company sells, they already
know whose name to look for.</p>

<h2>Why it works</h2>

<p>For most B2B companies under a few hundred people, a founder's profile tends to
start more conversations than the company page, because people follow people.
Three things make the format effective, and they are worth understanding because
they shape the plan.</p>

<h3>Trust travels through a person</h3>
<p>A buyer deciding between two similar vendors often cannot judge the product from
the outside. They can judge whether the person behind it understands their problem.
A founder who has explained that problem clearly, in public, many times, is easy to
trust.</p>

<h3>Specific beats broad</h3>
<p>LinkedIn favours writing that is credible and useful to a professional
audience, and tends to punish anything that reads like an advert. That constraint is good news: the bar is
clarity, not production budget. Concrete detail from real work outperforms
generalised advice.</p>

<h3>Conversations are the unit of growth</h3>
<p>Comments are worth more than likes, and a good comment thread teaches the next
reader as much as the post did. A founder who answers every comment turns each post
into several small conversations with buyers.</p>

<h2>Does it actually work?</h2>

<p>Yes, for companies where trust matters in the sale and the founder is willing to
be visible. It works through repetition, so it needs months, not days. It does not
work as a replacement for outbound if you need meetings this month. It makes
outbound better, because the person you contact has seen your name before.</p>

<p>It also asks something real of the founder: opinions, examples, and time. Teams
that try to remove all three end up with content that nobody remembers.</p>

<h2>How long should you give it?</h2>

<table>
  <thead><tr><th>Period</th><th>Goal</th><th>What you should have</th></tr></thead>
  <tbody>
    <tr><td><strong>Days 1 to 3</strong></td><td>Fix the profile</td><td>Headline, About, Featured, and a one-line account purpose</td></tr>
    <tr><td><strong>Days 4 to 14</strong></td><td>Establish the rhythm</td><td>Three or four posts a week, daily comments, first replies from target buyers</td></tr>
    <tr><td><strong>Days 15 to 30</strong></td><td>Add proof and conversations</td><td>A worked example, direct messages that start from your posts, first scorecard</td></tr>
    <tr><td><strong>Days 31 to 90</strong></td><td>Compound</td><td>Sales calls where the buyer mentions a post; clear view of which formats work</td></tr>
  </tbody>
</table>

<p>What to avoid: posting daily for two weeks, then disappearing. The account built
up very little and then went quiet. Three or four posts a week for three months
beats seven a week for three weeks.</p>

<h2>The 30-day founder-led LinkedIn process</h2>

<h3>Before you do anything: decide what the account is for</h3>

<p>Write a one-line purpose, for example: "Help heads of operations at mid-sized
logistics firms stop losing hours to manual reporting." Every post should map to it.
Founder accounts drift into general business advice and personal updates, and a
purpose line is what keeps the audience you want following you.</p>

<h3>Days 1 to 3: fix the profile</h3>

<p>Every post sends people to your profile, so make it do a job:</p>

<ol>
  <li><strong>Headline</strong>: say who you help and what changes for them, not just
  your title.</li>
  <li><strong>Banner and photo</strong>: a clear face and one line stating the
  promise.</li>
  <li><strong>About section</strong>: the buyer's problem, how you approach it, and one
  way to start a conversation.</li>
  <li><strong>Featured section</strong>: your best proof, such as a customer story or a
  worked example, and a way to book a call.</li>
</ol>

<p>Do not publish anything yet. A strong first post that lands on a blank profile
wastes its reach.</p>

<h3>Days 4 to 14: start the rhythm</h3>

<p>Publish three or four posts a week. Pull raw material from sales calls and
support tickets, and use five repeatable post types:</p>

<table>
  <thead><tr><th>Post type</th><th>What it does</th><th>Source material</th></tr></thead>
  <tbody>
    <tr><td><strong>Buyer question</strong></td><td>Answers one question prospects actually ask</td><td>Discovery calls, support tickets</td></tr>
    <tr><td><strong>Decision story</strong></td><td>Shows a trade-off you made and why</td><td>Your own roadmap, hiring, pricing decisions</td></tr>
    <tr><td><strong>Worked example</strong></td><td>Walks through how a customer or you solved something, with permission</td><td>Customer projects, internal numbers you may share</td></tr>
    <tr><td><strong>Contrarian take</strong></td><td>States a position the category disagrees with, and defends it</td><td>Your brand position brief</td></tr>
    <tr><td><strong>Behind the work</strong></td><td>Builds trust by showing process and mistakes</td><td>Postmortems, weekly reviews</td></tr>
  </tbody>
</table>

<p>A balanced week is two buyer questions, one decision story or worked example, and
one take. Each post should open with a specific line that earns the "see more"
click, keep paragraphs short, carry one idea, and end with a real question rather
than "thoughts?". Keep promotion to a footnote, and only after the post has been
useful.</p>

<h3>Days 15 to 21: add proof and engage like a peer</h3>

<p>Publish one worked example, with permission, and begin the engagement routine
that does as much work as the posts:</p>

<ol>
  <li>Make a list of 30 to 50 target buyers and the people they listen to.</li>
  <li>Comment on their posts with a point of your own, not praise.</li>
  <li>Reply to everyone who comments on yours, ideally within the first hour.</li>
  <li>Move good conversations to direct messages and offer help first.</li>
  <li>Never send a cold pitch as the first message.</li>
</ol>

<h3>Days 22 to 30: review and set month two</h3>

<p>Read the scorecard and decide which post types to keep, which to cut, and which
topic to double down on. Change one thing at a time.</p>

<h2>A weekly routine that survives a busy week</h2>

<table>
  <thead><tr><th>When</th><th>Task</th><th>Time</th></tr></thead>
  <tbody>
    <tr><td><strong>Monday</strong></td><td>Pull three to five raw items from calls and tickets; pick the week's posts</td><td>30 min</td></tr>
    <tr><td><strong>Tuesday</strong></td><td>Generate drafts from your brief, then rewrite the specifics in your own words</td><td>60 min</td></tr>
    <tr><td><strong>Wednesday</strong></td><td>Review against the checklist below; approve and schedule</td><td>20 min</td></tr>
    <tr><td><strong>Daily</strong></td><td>Reply to comments; comment on buyers' posts</td><td>15 min</td></tr>
    <tr><td><strong>Friday</strong></td><td>Read the scorecard; note what drew conversations</td><td>15 min</td></tr>
  </tbody>
</table>

<h3>Use AI for the skeleton, not the voice</h3>

<p>LinkedIn readers notice generic writing quickly. Use a drafting tool for
structure, hooks, and variations, then edit hard before anything is published:
replace every general statement with a specific example, cut filler openings and
closers, check every number and customer reference, and read it aloud. If you would
not say it to a prospect, rewrite it. In Genfeed, drafts go to an approval queue
where you review them before they are published, which keeps the last human pass
from being skipped.</p>

<h2>The scorecard</h2>

<ul>
  <li><strong>Profile views and follower growth</strong> from your target roles.</li>
  <li><strong>Comments from people on your target list</strong>, not total comments.</li>
  <li><strong>Inbound messages and intro requests</strong> per month.</li>
  <li><strong>Sales calls that mention a post</strong>: ask in discovery.</li>
  <li><strong>Hours spent per week</strong>, so you notice if the system is too heavy
  to last.</li>
</ul>

<h2>Mistakes that undo progress</h2>

<p><strong>Posting daily and then vanishing.</strong> Repetition is the mechanism. A
burst followed by silence leaves the audience with nothing to remember.</p>

<p><strong>Letting the company page do the founder's job.</strong> A company page
rarely starts the same conversations. Keep it active for credibility, and let the
person lead.</p>

<p><strong>Writing about the product instead of the buyer's problem.</strong> Readers
follow for what they learn. The product earns its place as proof, not as the
subject.</p>

<p><strong>Using AI to write the whole post, including the opinion.</strong> The
opinion is the part nobody else can supply. Generate structure and keep your own
position.</p>

<p><strong>Tagging people for reach rather than relevance.</strong> Over-tagging reads
as spam and costs goodwill with the people you most want to keep.</p>

<p><strong>Treating comments as a vanity metric.</strong> A comment is the start of a
conversation with a buyer. Answer it like one.</p>

<h2>Doing it yourself versus having it run for you</h2>

<h3>When doing it yourself works</h3>

<p>If the founder enjoys writing and can protect about two to three hours a week
for posts plus fifteen minutes a day for engagement, do it yourself. Nobody else
has your examples, and the routine above is light enough to keep.</p>

<h3>When it stops working</h3>

<p>It stops working when the weeks get busy. The first thing to go is the review
step, then the engagement, then the posting. By then you have lost the repetition
that made the first month worth doing. At that point you need a team that plans,
drafts, and schedules from your input, while you stay accountable for what goes
out.</p>

${DONE_FOR_YOU_PRICING}

<h2>Summary</h2>

<p>Founder-led LinkedIn works because buyers trust people who explain their problem
clearly and often. A good profile, five repeatable post types, a light weekly
routine, and a habit of answering every comment are enough to start.</p>

<p>The process is not complicated. The discipline to run it every week, for months,
is where most founders fall short. If you can protect the time, run it yourself. If
you cannot, the right move is to keep your voice and hand off the operating work.</p>

<h2>Frequently asked questions</h2>

<h3>Should I post from my profile or the company page?</h3>
<p>Start with the founder or a named expert. Company pages are useful for credibility
and for repurposing, but a person's posts usually start more conversations. Keep the
page active, and let the person lead.</p>

<h3>How often should a founder post?</h3>
<p>Three or four considered posts a week is a sustainable target for most founders.
Two good posts a week beat seven filler ones.</p>

<h3>What if I do not have a big following?</h3>
<p>You do not need one. A relevant network of a few hundred buyers who respond is more
useful than thousands of unrelated followers. Focus on engagement with the people you
want to reach.</p>

<h3>Is it a problem if AI helps draft my posts?</h3>
<p>Not by itself. The problems are unedited output, invented claims, and a voice that
sounds like everyone else's. Keep your own examples, numbers, and opinions in every
post.</p>

<h3>Can someone else run my LinkedIn?</h3>
<p>A team can plan, draft, and schedule from your input, but the account should still
reflect your view, and you should approve what goes out. That is how Genfeed's
done-for-you service works.</p>

<h2>Related reading</h2>
<ul>
  <li><a href="https://genfeed.ai/articles/how-to-start-b2b-content-playbook">How to start B2B content: a 30-day playbook</a></li>
  <li><a href="https://genfeed.ai/articles/how-to-grow-on-linkedin-with-ai-generated-content">How to grow on LinkedIn with AI-generated content</a></li>
  <li><a href="https://genfeed.ai/articles/approval-queue-review-before-publishing">Approval queue: review before publishing</a></li>
  <li><a href="https://genfeed.ai/founder-content">Genfeed for founder content</a></li>
  <li><a href="https://genfeed.ai/linkedin">Genfeed for LinkedIn</a></li>
</ul>

<h2>Sources and further reading</h2>
<p>Platform ranking behaviour changes often and LinkedIn does not publish its
algorithm. The routine and post types above are operating judgment; check them
against your own analytics and the platform's current documentation.</p>
<ul>
  <li><a href="https://docs.genfeed.ai/guides/publishing/social-media/linkedin" rel="noopener noreferrer">Genfeed LinkedIn connector reference</a></li>
  <li><a href="https://docs.genfeed.ai/" rel="noopener noreferrer">Genfeed documentation</a></li>
</ul>
`;

const CUSTOMER_CALLS_TO_CONTENT = `
<p>The best B2B content ideas are already being said out loud, every week, by your
buyers, on calls you are on. Most teams never capture them. They sit down on a
Monday, ask what to post, and produce something generic, while a recording of a
buyer describing the exact problem in their own words sits unused.</p>

<p>This guide covers all of it: what call-mined content is, why it beats
brainstorming, the step-by-step process for turning calls into posts, the rules
that keep it safe for customers, the mistakes that undo it, and when it makes sense
to run it yourself versus hand it to a service.</p>

<h2>What is call-mined content?</h2>

<p>Call-mined content is content whose ideas, questions, objections, and wording come
from real conversations with buyers and customers: sales discovery calls, onboarding
sessions, support threads, and lost-deal reviews. You are not publishing the calls.
You are publishing the answers to what people asked on them.</p>

<p>In practice, instead of starting from a blank page, you start from a short list of
things buyers actually said. A buyer who asks "how do we know if this will fit our
process?" has given you a post. A buyer who says "we tried this before and it fell
apart in month two" has given you a post and the angle.</p>

<h2>Why calls beat brainstorming</h2>

<h3>You write in the buyer's language</h3>
<p>Buyers describe their problem differently from how a vendor describes the
solution. When your post uses their phrasing, a reader recognises the problem in the
first line, and that recognition is what stops the scroll.</p>

<h3>You answer questions people already have</h3>
<p>A question asked on three separate calls is a strong sign it is on the minds of
many buyers who never reached you. Answering it in public reaches them too.</p>

<h3>You stop guessing which topics matter</h3>
<p>Brainstormed topics reflect what the team finds interesting. Call topics reflect
what buyers find worth asking about. The overlap is smaller than most teams
expect.</p>

<h2>Does it actually work?</h2>

<p>It works when the volume of calls is real: ten or more conversations to draw from
gives you repeating patterns. With two or three calls you are mostly collecting
anecdotes. It also depends on discipline about privacy. The content is only useful
if customers stay comfortable with it, so the rules in the next section come first.</p>

<h2>How long does it take?</h2>

<table>
  <thead><tr><th>Period</th><th>Goal</th><th>What you should have</th></tr></thead>
  <tbody>
    <tr><td><strong>Days 1 to 3</strong></td><td>Set the rules</td><td>Consent and anonymisation rules, a shared notes template</td></tr>
    <tr><td><strong>Days 4 to 10</strong></td><td>Collect</td><td>Notes from at least ten recent conversations, tagged</td></tr>
    <tr><td><strong>Days 11 to 14</strong></td><td>Extract</td><td>A phrase bank and a ranked list of questions and objections</td></tr>
    <tr><td><strong>Days 15 to 30</strong></td><td>Publish</td><td>Three posts a week, each tied to one call-sourced item</td></tr>
    <tr><td><strong>Day 30 onward</strong></td><td>Loop</td><td>A weekly 30-minute habit that feeds the next week's posts</td></tr>
  </tbody>
</table>

<h2>The call-to-content process</h2>

<h3>Before you do anything: set the privacy rules</h3>

<p>Decide these before you read a single transcript:</p>

<ol>
  <li><strong>Consent.</strong> Recording and use rules vary by place and by customer
  agreement. Check what you have agreed with customers and what applies to you, and
  record only with consent.</li>
  <li><strong>Anonymise by default.</strong> Strip names, company names, and
  identifying details. A post should not let a reader work out who said it.</li>
  <li><strong>Ask before you attribute.</strong> If you want to name a customer, quote
  them, or share their numbers, get explicit permission in writing.</li>
  <li><strong>Keep raw material private.</strong> Notes and transcripts stay in your
  internal workspace and never in a public repository or shared document.</li>
</ol>

<h3>Step 1: Collect from five sources</h3>

<ul>
  <li><strong>Discovery calls</strong>: the first questions and the framing buyers
  use.</li>
  <li><strong>Late-stage calls</strong>: the objections that nearly stopped the
  deal.</li>
  <li><strong>Onboarding sessions</strong>: where new customers get stuck and what
  they expected.</li>
  <li><strong>Support threads</strong>: the recurring "how do I" questions.</li>
  <li><strong>Lost-deal reviews</strong>: the stated reason and the real reason.</li>
</ul>

<h3>Step 2: Tag every note</h3>

<p>Use four tags and nothing else: <strong>question</strong>, <strong>objection</strong>,
<strong>story</strong>, and <strong>exact words</strong>. A single note can carry more
than one tag. Anything you cannot tag is probably not worth publishing.</p>

<h3>Step 3: Build a phrase bank</h3>

<p>Copy the buyer's exact words, anonymised, into one list. These phrases are your
openers and headlines. "We spent a quarter on this and have nothing to show" is a
better first line than any sentence you would write from scratch.</p>

<h3>Step 4: Turn each item into a format</h3>

<table>
  <thead><tr><th>Call item</th><th>Becomes</th><th>Example shape</th></tr></thead>
  <tbody>
    <tr><td><strong>A repeated question</strong></td><td>A direct-answer post</td><td>Question as the first line, answer in two lines, reasoning below</td></tr>
    <tr><td><strong>An objection</strong></td><td>A "here is when they are right" post</td><td>Concede what is true, then show the condition under which it changes</td></tr>
    <tr><td><strong>A story</strong></td><td>A short worked example</td><td>Situation, what was tried, what changed, what you would do differently</td></tr>
    <tr><td><strong>Exact words</strong></td><td>A headline or opener</td><td>Use the phrase as the first line</td></tr>
  </tbody>
</table>

<h3>Step 5: Review before publishing</h3>

<p>Run every draft through three checks: could a reader identify the customer, is
every claim something you can support, and does it contain one specific detail only
you could have written. In Genfeed, drafts wait in the approval queue until someone
reviews them, so nothing goes out on a busy week without a check.</p>

<h3>Step 6: Close the loop</h3>

<p>Once a week, spend 30 minutes on the posts that drew replies. Note which call item
each came from. Over a month, you will see which kinds of items travel and which do
not, and the next batch gets better.</p>

<h2>Mistakes that undo it</h2>

<p><strong>Publishing something that identifies a customer.</strong> It costs trust
with exactly the people the content is meant to win. Anonymise by default and ask
before you attribute.</p>

<p><strong>Collecting without tagging.</strong> A folder of transcripts is not a source
library. Without tags you will not find the pattern across calls.</p>

<p><strong>Treating one loud call as a trend.</strong> One buyer's strong opinion is a
data point. Look for what repeats across several calls.</p>

<p><strong>Cleaning up the buyer's language.</strong> The rough phrasing is the value.
Polish it into vendor language and the recognition disappears.</p>

<p><strong>Letting the habit lapse.</strong> The method works because it is weekly.
Skip a month and you are back to brainstorming.</p>

<h2>Doing it yourself versus using a service</h2>

<h3>When doing it yourself works</h3>
<p>If you are on the calls yourself, you already hold the raw material. Thirty
minutes a week to tag notes and pick posts is light, and you will understand your
buyers better for it.</p>

<h3>When it stops working</h3>
<p>It stops when the calls are spread across a team, or when nobody has the time to
turn notes into reviewed, published posts. The ideas exist but the output does
not.</p>

<h3>Done-for-you</h3>
<p>When the constraint is time rather than ideas, a service can take your notes, turn
them into drafts, run the review step with you, and publish on a schedule, so the
weekly loop does not depend on anyone's calendar.</p>

${DONE_FOR_YOU_PRICING}

<h2>Summary</h2>

<p>Buyers tell you what to write about every week. Capturing it, tagging it, and
turning it into short, reviewed, anonymised posts gives you content that sounds like
the market instead of like the vendor.</p>

<p>The process is not complicated. The discipline to run it weekly, and to protect
your customers' privacy while doing it, is where teams fall short. Start with the
privacy rules, collect ten conversations, and publish the first three posts within
the month.</p>

<h2>Frequently asked questions</h2>

<h3>Do I need to record calls to do this?</h3>
<p>No. Good notes taken during or just after a call are enough. If you do record,
make sure you have consent and that you are comfortable with how the recording is
stored.</p>

<h3>Is it safe to use what a customer said?</h3>
<p>Only if you anonymise it and the post cannot identify them, or you have their
explicit permission. When in doubt, ask or leave it out.</p>

<h3>How many calls do I need before this works?</h3>
<p>Around ten recent conversations is a practical start, because patterns begin to
repeat. With fewer, treat what you find as hypotheses.</p>

<h3>Can AI help with the notes?</h3>
<p>It can speed up tagging and drafting. Check what your customer agreements and
tools allow before sending conversation content to any third-party service, and keep
the review step human.</p>

<h2>Related reading</h2>
<ul>
  <li><a href="https://genfeed.ai/articles/how-to-start-b2b-content-playbook">How to start B2B content: a 30-day playbook</a></li>
  <li><a href="https://genfeed.ai/articles/founder-led-linkedin-b2b-playbook">Founder-led LinkedIn for B2B</a></li>
  <li><a href="https://genfeed.ai/articles/approval-queue-review-before-publishing">Approval queue: review before publishing</a></li>
  <li><a href="https://genfeed.ai/articles/brand-setup-and-brand-memory">Brand setup and brand memory</a></li>
</ul>

<h2>Sources and further reading</h2>
<p>This guide is operating judgment rather than research. Privacy and recording rules
differ by jurisdiction and contract; check the rules that apply to you.</p>
<ul>
  <li><a href="https://docs.genfeed.ai/" rel="noopener noreferrer">Genfeed documentation</a></li>
</ul>
`;

const CASE_STUDY_TO_ASSETS = `
<p>Most B2B teams write a case study once, publish it as a page nobody visits, and
move on. It took weeks to get the customer's approval and the numbers right, and it
is the strongest piece of proof the company owns. Then it sits in a navigation menu.</p>

<p>This guide covers all of it: what it means to turn one case study into a content
set, why single-use proof gets wasted, the step-by-step process for getting twenty
useful assets out of one story, the mistakes that undo it, and when it makes sense to
run it yourself versus have a team do it.</p>

<h2>What does turning one case study into 20 assets mean?</h2>

<p>It means treating a customer story as raw material, not as a finished product. A
case study has a situation, a trigger, a set of options, a decision, a result, and
lessons. Each of those can stand alone as a post, a script, a sales snippet, or a
newsletter item. The story stays the same. The packaging changes for each channel
and each stage of the buying process.</p>

<h2>Why single-use proof gets wasted</h2>

<h3>Buyers meet proof in many places</h3>
<p>A prospect may meet your story in a feed, in an email, in a sales call, or in a
shared deck. One long page serves only the people who go looking for it.</p>

<h3>Repetition is how proof lands</h3>
<p>One impression rarely persuades. The same result, seen in different shapes across
several weeks, is what makes a claim feel established.</p>

<h3>Approvals are expensive</h3>
<p>Customer sign-off is the slow part. Once you have it for a story, extracting more
value from it costs far less than starting another.</p>

<h2>Does it actually work?</h2>

<p>It works when the story is real and the customer has approved how it is told. It
does not work when you stretch a thin story to fill twenty slots. If the result is
modest, make it five assets, not twenty. The number is a ceiling, not a target.</p>

<h2>How long does it take?</h2>

<table>
  <thead><tr><th>Period</th><th>Goal</th><th>What you should have</th></tr></thead>
  <tbody>
    <tr><td><strong>Day 1</strong></td><td>Get approval</td><td>Written sign-off on facts, numbers, and wording the customer allows</td></tr>
    <tr><td><strong>Days 2 to 3</strong></td><td>Extract the spine</td><td>One page: situation, trigger, options, decision, result, lessons</td></tr>
    <tr><td><strong>Days 4 to 7</strong></td><td>Draft the set</td><td>Up to twenty drafts across the formats in the map below</td></tr>
    <tr><td><strong>Days 8 to 9</strong></td><td>Review</td><td>Customer check on anything that quotes or names them</td></tr>
    <tr><td><strong>Days 10 to 30</strong></td><td>Publish and reuse</td><td>One or two assets a week; sales assets handed to the team</td></tr>
  </tbody>
</table>

<h2>The case-study-to-assets process</h2>

<h3>Before you do anything: get the approvals</h3>

<ol>
  <li>Confirm in writing what you may say about the customer, which numbers you may
  use, and whether you may name them.</li>
  <li>Agree who at the customer checks the final wording.</li>
  <li>Ask whether they will let you quote them directly. A short, specific quote is
  worth more than a paragraph of your summary.</li>
</ol>

<p>Never publish a number the customer has not approved.</p>

<h3>Step 1: Write the story spine</h3>

<p>One page, six lines: the situation before, the trigger that made them act, the
options they considered, the decision they made and why, the result, and what they
would tell a peer. Every asset below comes from one or more lines of this page.</p>

<h3>Step 2: Use the asset map</h3>

<table>
  <thead><tr><th>Asset</th><th>Count</th><th>Source line</th></tr></thead>
  <tbody>
    <tr><td><strong>Short text posts</strong></td><td>5</td><td>Trigger, options, decision, result, lessons (one each)</td></tr>
    <tr><td><strong>Carousel or PDF slides</strong></td><td>2</td><td>Full story; before and after</td></tr>
    <tr><td><strong>Short video scripts</strong></td><td>3</td><td>Trigger; decision; result</td></tr>
    <tr><td><strong>Newsletter items</strong></td><td>2</td><td>Full story; lessons for a peer</td></tr>
    <tr><td><strong>Sales one-pager</strong></td><td>1</td><td>Situation and result</td></tr>
    <tr><td><strong>Objection-handling snippets for sales</strong></td><td>3</td><td>Options (why not the alternative); decision; result</td></tr>
    <tr><td><strong>Pull quotes</strong></td><td>2</td><td>Approved customer quotes</td></tr>
    <tr><td><strong>Webinar or talk outline</strong></td><td>1</td><td>Full story</td></tr>
    <tr><td><strong>FAQ additions</strong></td><td>1</td><td>Questions the story answers</td></tr>
  </tbody>
</table>

<p>That adds up to twenty. Drop any row the story cannot support.</p>

<h3>Step 3: Draft in batches</h3>

<p>Draft by format, not by asset: all the text posts in one sitting, then all the
scripts. This keeps wording consistent and stops the set from drifting. Use a
drafting tool for structure and variations, but hold the facts to the spine page and
the approved numbers. In Genfeed you can keep the brand voice in brand memory and
produce text, images, and video from the same brief, so the set looks like one
campaign.</p>

<h3>Step 4: Review against the spine</h3>

<p>Check every asset for three things: does it match the approved facts exactly, does
it add no claim the customer did not approve, and does it stand on its own without
the original page. Send anything that names or quotes the customer for their check
before it goes out.</p>

<h3>Step 5: Publish across weeks, not in a day</h3>

<p>Space the set out: one or two assets a week for ten to fifteen weeks is better than
a burst. Hand the sales assets to the team in the first week so the story is used on
calls while it is fresh.</p>

<h3>Step 6: Measure what travelled</h3>

<p>Note which assets drew replies or came up on calls. The next story should lean
into those shapes.</p>

<h2>Mistakes that undo it</h2>

<p><strong>Skipping the approval step.</strong> A published number the customer did
not approve can end the relationship and the story with it.</p>

<p><strong>Stretching a thin story.</strong> Twenty versions of a modest result read
as padding. Match the count to the substance.</p>

<p><strong>Changing the facts between formats.</strong> A rounded number in one post
and an exact one in another invites questions. Work from the spine page.</p>

<p><strong>Publishing everything in one week.</strong> You use up the audience's
attention at once and lose the repetition.</p>

<p><strong>Forgetting sales.</strong> The people who most need the story are the ones
talking to prospects. If sales never receives the assets, half the value is lost.</p>

<h2>Doing it yourself versus using a service</h2>

<h3>When doing it yourself works</h3>
<p>If you have one good story and a few days to spare, you can run this yourself. The
spine page and the asset map are enough to follow.</p>

<h3>When it stops working</h3>
<p>It stops working when you have several stories, or when each one needs drafting,
design, review, and a publishing schedule. The assets multiply faster than the time
to ship them.</p>

<h3>Done-for-you</h3>
<p>A done-for-you service can take an approved story, produce the set across text,
images, and video, run it through your review, and publish it over weeks, while you
keep the relationship with the customer.</p>

${DONE_FOR_YOU_PRICING}

<h2>Summary</h2>

<p>A case study is the strongest proof you own, and a single page uses very little of
it. Extract the spine, map it to formats, draft in batches, review against the
approved facts, and publish over weeks so the story lands more than once.</p>

<p>The process is not complicated. The discipline to get approvals and to keep the
facts consistent is where teams fall short. Start with one story, and let its size
decide how many assets it earns.</p>

<h2>Frequently asked questions</h2>

<h3>Can I do this with an anonymous customer?</h3>
<p>Yes. Anonymised stories work, though quotes and logos are lost. Be clear about the
kind of company and the size of the result without identifying them.</p>

<h3>What if the customer will not approve numbers?</h3>
<p>Use qualitative results and the customer's own words, and drop the numbers.
Invented or estimated figures are not worth the risk.</p>

<h3>How many assets should I make from one story?</h3>
<p>As many as the story supports. A strong story with a clear result can carry twenty.
A modest one may carry five.</p>

<h3>Do I need a designer?</h3>
<p>For carousels and video, someone needs to design them. Brand memory and image and
video generation can cover much of that, but a person should review the final
output.</p>

<h2>Related reading</h2>
<ul>
  <li><a href="https://genfeed.ai/articles/how-to-start-b2b-content-playbook">How to start B2B content: a 30-day playbook</a></li>
  <li><a href="https://genfeed.ai/articles/turn-customer-calls-into-b2b-content-playbook">How to turn customer calls into B2B content</a></li>
  <li><a href="https://genfeed.ai/articles/repurpose-blog-post-into-video-images-social-posts">Repurpose a blog post into video, images, and social posts</a></li>
  <li><a href="https://genfeed.ai/articles/approval-queue-review-before-publishing">Approval queue: review before publishing</a></li>
</ul>

<h2>Sources and further reading</h2>
<p>This guide is operating judgment rather than research. Counts and timing are a
starting plan to adjust against your own results.</p>
<ul>
  <li><a href="https://docs.genfeed.ai/" rel="noopener noreferrer">Genfeed documentation</a></li>
</ul>
`;

const MEASURE_B2B_CONTENT = `
<p>The hardest question in B2B content is the one the CEO asks in month three: is
this working? Most teams answer with impressions and likes, which feel like an answer
and are not one. The numbers that matter, conversations and pipeline, are harder to
see, so they go unmeasured.</p>

<p>This guide covers all of it: what it means to measure B2B content against
pipeline, why the usual metrics mislead, the step-by-step setup for a scorecard you
can run in a spreadsheet, the mistakes that undo it, and when it makes sense to run it
yourself versus have a team report it.</p>

<h2>What does measuring content against pipeline mean?</h2>

<p>It means connecting what you publish to what happens in sales: conversations
started, meetings booked, and opportunities opened. Two terms are worth defining,
because teams use them loosely. In this guide, <strong>content-sourced</strong> means a
buyer first came to you through content, and <strong>content-touched</strong> means a
buyer engaged with your content at some point before or during the sale.</p>

<h2>Why the usual metrics mislead</h2>

<h3>Likes and impressions are cheap</h3>
<p>They show a post was seen or liked. They do not show a buyer cared enough to act.
A post can do well on both and lead to nothing.</p>

<h3>B2B buyers rarely click</h3>
<p>Much B2B influence happens where it cannot be tracked: a screenshot in a team chat,
a mention in a call, a post read and remembered. Click-based attribution misses all of
it.</p>

<h3>Long cycles hide the link</h3>
<p>A buyer may read your posts for months before replying. If you only count the last
click, content looks like it did nothing.</p>

<h2>Does measurement actually work?</h2>

<p>It works well enough to make decisions, and no better. You will not get a perfect
number. You can get a consistent one, and consistency is what lets you compare this
month to last month and one topic to another. Treat the scorecard as a way to decide
what to do next, not as a verdict on whether marketing was worth the money.</p>

<h2>How long before the data is useful?</h2>

<table>
  <thead><tr><th>Period</th><th>Goal</th><th>What you should have</th></tr></thead>
  <tbody>
    <tr><td><strong>Week 1</strong></td><td>Define events</td><td>A list of stages and a sheet to log them</td></tr>
    <tr><td><strong>Weeks 2 to 4</strong></td><td>Capture the baseline</td><td>Weekly counts for replies, messages, and calls that mention content</td></tr>
    <tr><td><strong>Days 31 to 60</strong></td><td>Compare topics</td><td>Which topics and formats lead to conversations</td></tr>
    <tr><td><strong>Days 61 to 90</strong></td><td>Tie to pipeline</td><td>Opportunities that were content-sourced or content-touched</td></tr>
  </tbody>
</table>

<h2>The measurement process</h2>

<h3>Before you do anything: define the events</h3>

<p>Write down the steps a buyer takes from stranger to opportunity, in your own terms.
A workable list: sees a post, replies or saves, sends a message, books a call, becomes
an opportunity. Give each step a name and decide where it gets logged.</p>

<h3>Step 1: Ask every new lead how they heard of you</h3>

<p>Add one open-text field to your booking form and your discovery call notes: "How did
you first hear about us?" Self-reported answers capture what trackers miss, such as
"I keep seeing your posts". Log them in the CRM as written, then tag them.</p>

<h3>Step 2: Tag opportunities by content involvement</h3>

<p>When an opportunity is created, record whether content was first touch,
content-touched, or not mentioned. Use the buyer's own words from Step 1 as the
evidence.</p>

<h3>Step 3: Use tracking links only where they work</h3>

<p>Where a post links to a page you control, use a consistent tracking-link naming
scheme so you can see visits by post. Do not rely on it as the whole picture, and do
not distort a post to fit it.</p>

<h3>Step 4: Run a weekly scorecard</h3>

<table>
  <thead><tr><th>Metric</th><th>Where it comes from</th><th>How often</th></tr></thead>
  <tbody>
    <tr><td><strong>Posts published</strong></td><td>Your calendar</td><td>Weekly</td></tr>
    <tr><td><strong>Replies from target buyers</strong></td><td>Platform notifications, tagged by hand</td><td>Weekly</td></tr>
    <tr><td><strong>Inbound messages</strong></td><td>Inbox</td><td>Weekly</td></tr>
    <tr><td><strong>Calls that mention content</strong></td><td>CRM notes</td><td>Weekly</td></tr>
    <tr><td><strong>Opportunities, content-sourced and content-touched</strong></td><td>CRM tags</td><td>Monthly</td></tr>
    <tr><td><strong>Hours spent</strong></td><td>Your own log</td><td>Weekly</td></tr>
  </tbody>
</table>

<h3>Step 5: Hold a monthly review</h3>

<p>Once a month, read the scorecard next to the posts. Which topics led to replies from
the right people? Which formats did nothing? Make three decisions: what to repeat,
what to stop, and what to test next.</p>

<h3>Step 6: Set decision rules against your own baseline</h3>

<p>Decide in advance what counts as "working", and compare to your own baseline rather
than an industry number. For example: keep a format if it produces more replies from
target buyers than the previous month, and stop it after three months if it does not.
Write the rule down before you see the data.</p>

<h2>Mistakes that undo it</h2>

<p><strong>Counting reach as results.</strong> Impressions are a cost-side signal. They
show you were visible, not that anyone acted.</p>

<p><strong>Waiting for perfect attribution.</strong> You will never have it. Start with
self-reported answers and refine.</p>

<p><strong>Changing the definitions mid-stream.</strong> If "content-touched" means
something different each quarter, the trend line is meaningless. Write the definitions
down and keep them.</p>

<p><strong>Judging on too little time.</strong> Sales cycles are long. A month of data
shows engagement, not pipeline.</p>

<p><strong>Measuring without acting.</strong> A scorecard nobody uses at the monthly
review is overhead. Every review should end with a decision.</p>

<h2>Doing it yourself versus using a service</h2>

<h3>When doing it yourself works</h3>
<p>A spreadsheet, one extra field in your CRM, and a 30-minute monthly review are
enough to start. It is cheap and teaches you what your buyers respond to.</p>

<h3>When it stops working</h3>
<p>It stops when the data lives in several tools, when more than one channel is
running, or when nobody has time to read the results and change the plan.</p>

<h3>Done-for-you</h3>
<p>A done-for-you service can plan, produce, and publish the content and test it
against your best ads, so the question of what to repeat is answered with results
rather than opinions.</p>

${DONE_FOR_YOU_PRICING}

<h2>Summary</h2>

<p>You cannot measure B2B content perfectly, but you can measure it consistently.
Define the events, ask every lead how they heard of you, tag opportunities by content
involvement, keep a weekly scorecard, and decide against your own baseline.</p>

<p>The process is not complicated. The discipline to keep definitions stable and to act
on the monthly review is where teams fall short. Start with one field in your CRM and
one sheet, and give it ninety days.</p>

<h2>Frequently asked questions</h2>

<h3>What is a good number of content-sourced opportunities?</h3>
<p>There is no universal number. It depends on your price, your cycle, and how long you
have been publishing. Compare against your own baseline.</p>

<h3>Is self-reported attribution reliable?</h3>
<p>It is imperfect and biased toward the most memorable touch, but it captures
influence that trackers miss. Use it alongside whatever tracking you have, not
instead.</p>

<h3>Do I need a marketing analytics tool?</h3>
<p>Not to start. A spreadsheet and a CRM field are enough for the first quarter. Add
tooling when the manual work becomes the bottleneck.</p>

<h3>How soon should I expect pipeline?</h3>
<p>Expect conversations first, usually within the first month, and opportunities after
a quarter or more, depending on your sales cycle.</p>

<h2>Related reading</h2>
<ul>
  <li><a href="https://genfeed.ai/articles/how-to-start-b2b-content-playbook">How to start B2B content: a 30-day playbook</a></li>
  <li><a href="https://genfeed.ai/articles/founder-led-linkedin-b2b-playbook">Founder-led LinkedIn for B2B</a></li>
  <li><a href="https://genfeed.ai/articles/turn-customer-calls-into-b2b-content-playbook">How to turn customer calls into B2B content</a></li>
  <li><a href="https://genfeed.ai/articles/measure-ai-content-performance-across-social-platforms">Measure AI content performance across social platforms</a></li>
</ul>

<h2>Sources and further reading</h2>
<p>This guide is operating judgment rather than research. The definitions are working
definitions for this guide; adopt your own and keep them stable.</p>
<ul>
  <li><a href="https://docs.genfeed.ai/" rel="noopener noreferrer">Genfeed documentation</a></li>
</ul>
`;

export const SEO_ARTICLES_WAVE_5: readonly SeedArticle[] = [
  {
    category: ArticleCategory.GUIDE,
    content: START_B2B_CONTENT,
    coverImageUrl: articleArtwork('how-to-start-b2b-content-playbook'),
    label: 'How to Start B2B Content: The Complete 30-Day Playbook',
    publishedAt: '2026-12-10T09:00:00.000Z',
    slug: 'how-to-start-b2b-content-playbook',
    summary:
      'A complete guide to starting B2B content: what it is, why most of it is ignored, a day-by-day 30-day plan, the mistakes that undo progress, and when to hand it to a service.',
  },
  {
    category: ArticleCategory.GUIDE,
    content: FOUNDER_LED_LINKEDIN,
    coverImageUrl: articleArtwork('founder-led-linkedin-b2b-playbook'),
    label: 'Founder-Led LinkedIn for B2B: The Complete Playbook',
    publishedAt: '2026-12-15T09:00:00.000Z',
    slug: 'founder-led-linkedin-b2b-playbook',
    summary:
      'A complete guide to founder-led LinkedIn for B2B: why it works, how to fix the profile, five repeatable post types, a day-by-day 30-day plan, and when to have a team run it.',
  },
  {
    category: ArticleCategory.GUIDE,
    content: CUSTOMER_CALLS_TO_CONTENT,
    coverImageUrl: articleArtwork(
      'turn-customer-calls-into-b2b-content-playbook',
    ),
    label: 'How to Turn Customer Calls Into B2B Content: The Complete Playbook',
    publishedAt: '2026-12-17T09:00:00.000Z',
    slug: 'turn-customer-calls-into-b2b-content-playbook',
    summary:
      'A complete guide to turning sales and customer calls into B2B content: privacy rules, tagging, a phrase bank, formats, and a weekly loop.',
  },
  {
    category: ArticleCategory.GUIDE,
    content: CASE_STUDY_TO_ASSETS,
    coverImageUrl: articleArtwork('turn-one-case-study-into-20-b2b-assets'),
    label: 'How to Turn One Case Study Into 20 B2B Content Assets',
    publishedAt: '2026-12-22T09:00:00.000Z',
    slug: 'turn-one-case-study-into-20-b2b-assets',
    summary:
      'A complete guide to getting twenty useful assets from one approved customer story: the story spine, an asset map, review steps, and a publishing cadence.',
  },
  {
    category: ArticleCategory.GUIDE,
    content: MEASURE_B2B_CONTENT,
    coverImageUrl: articleArtwork(
      'measure-b2b-content-against-pipeline-playbook',
    ),
    label: 'How to Measure B2B Content Against Pipeline: The Complete Playbook',
    publishedAt: '2026-12-29T09:00:00.000Z',
    slug: 'measure-b2b-content-against-pipeline-playbook',
    summary:
      'A complete guide to measuring B2B content against pipeline: define events, ask how leads heard of you, tag opportunities, run a weekly scorecard, and decide against your own baseline.',
  },
];
