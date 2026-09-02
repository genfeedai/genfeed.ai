/**
 * Launch content for the public articles surface (genfeed.ai/articles).
 *
 * These articles were relocated out of `apps/docs` so that docs.genfeed.ai
 * stays developer/product reference (how the app works, API/CLI/MCP) while
 * prompting technique, platform growth strategy, and launch playbooks live on
 * the main domain as articles.
 *
 * `content` is **sanitized HTML, not markdown** — the website renders it with
 * `createMarkup()` (`packages/helpers/src/security/sanitize-html.helper.ts`)
 * and there is no markdown pipeline in `apps/website`. Only tags on that
 * helper's allowlist survive; author accordingly.
 *
 * Consumed by `scripts/seeds/articles.seed.ts`, which upserts on `slug`.
 */

import { ArticleCategory } from '@genfeedai/contracts';
import { articleArtwork } from './article-artwork';

export type SeedArticle = {
  category: ArticleCategory;
  /** Sanitized HTML body. See the module note above — this is not markdown. */
  content: string;
  /** Article artwork on the CDN. See `articleArtwork()`. */
  coverImageUrl: string;
  label: string;
  /** ISO-8601 release time. Future dates are scheduled publications. */
  publishedAt: string;
  slug: string;
  summary: string;
};

const CLEAR_FRAMEWORK = `
<p>Most bad AI output is not a model problem. It is a brief problem. The model
answered exactly the question you asked; the question was just vaguer than you
realised. This tutorial gives you a repeatable structure for writing prompts
that produce usable text on the first or second attempt instead of the sixth.</p>

<h2>The CLEAR framework</h2>

<p>Five things decide whether a prompt lands. Write them down every time until
the habit is automatic.</p>

<ul>
  <li><strong>Context</strong> — the background the model cannot infer: the
  product, the campaign, what already happened.</li>
  <li><strong>Length</strong> — a number, not an adjective. "Short" means
  nothing; "90 words" means something.</li>
  <li><strong>Expectations</strong> — the quality bar and style rules the output
  has to satisfy.</li>
  <li><strong>Audience</strong> — who reads it, and what they already know.</li>
  <li><strong>Role</strong> — the expertise the model should write from.</li>
</ul>

<p>A prompt missing Context and Audience produces generic copy. A prompt missing
Length produces an essay when you wanted a caption. A prompt missing
Expectations produces something you rewrite by hand, which defeats the point.</p>

<h2>Four moves that fix most prompts</h2>

<h3>1. Be specific</h3>

<p>Vague: <code>Write about marketing.</code></p>

<p>Specific: <code>Write a 500-word blog post about email marketing strategies
for e-commerce businesses targeting millennials.</code></p>

<p>The second version constrains topic, length, industry, and audience. Each
constraint removes a branch the model would otherwise have to guess.</p>

<h3>2. Provide context</h3>

<p>Vague: <code>Create a product description.</code></p>

<p>Specific: <code>Create a product description for our new eco-friendly water
bottle. Key features: BPA-free, 24-hour insulation, 750ml capacity, made from
recycled materials. Target audience: environmentally conscious outdoor
enthusiasts.</code></p>

<h3>3. Define the format</h3>

<p>Vague: <code>Give me social media content.</code></p>

<p>Specific: <code>Create 5 Instagram captions for a fitness brand. Each caption
should be 2-3 sentences, include a call-to-action, and use 3-5 relevant
hashtags.</code></p>

<h3>4. Specify tone</h3>

<p>Vague: <code>Write an email.</code></p>

<p>Specific: <code>Write a professional yet friendly follow-up email to a
potential client who showed interest in our consulting services. Use a
conversational tone while maintaining business professionalism.</code></p>

<h2>Advanced techniques</h2>

<h3>Chain of thought</h3>

<p>Break a complex task into ordered steps so the model reasons before it
writes.</p>

<pre><code>First, analyze the target audience for luxury watches.
Then, identify their main pain points.
Finally, write a product description that addresses these pain points.</code></pre>

<h3>Few-shot prompting</h3>

<p>Two examples teach a house style faster than a paragraph describing it.</p>

<pre><code>Write product titles in this style:
Example 1: "Premium Leather Wallet - RFID Protection, Slim Design"
Example 2: "Organic Cotton T-Shirt - Sustainable, Ultra-Soft Comfort"

Now create a title for noise-canceling headphones.</code></pre>

<h3>Role-based prompting</h3>

<pre><code>Act as an experienced SEO copywriter. Write a meta description for a
blog post about remote work productivity tips. Include relevant keywords
and keep it under 160 characters.</code></pre>

<h3>Constraint-based prompting</h3>

<pre><code>Write a product description with these constraints:
- Exactly 100 words
- Include 3 benefit statements
- Use power words: "revolutionary", "transform", "essential"
- End with a clear call-to-action</code></pre>

<h2>Reusable skeletons</h2>

<h3>Blog post</h3>

<pre><code>Topic: [Your Topic]
Target audience: [Describe audience]
Word count: [Number]
Tone: [Professional/Casual/Friendly]
Include: Introduction, 3-5 main points with subheadings, conclusion with CTA
SEO keywords: [List keywords]</code></pre>

<h3>Social media post</h3>

<pre><code>Platform: [Instagram/X/LinkedIn]
Brand voice: [Describe brand personality]
Goal: [Engagement/Sales/Awareness]
Include: Hook, value proposition, hashtags, CTA
Character limit: [Platform-specific limit]</code></pre>

<h3>Marketing email</h3>

<pre><code>Email type: [Welcome/Promotional/Newsletter]
Recipient: [Customer segment]
Primary goal: [Conversion/Engagement/Information]
Length: [Short/Medium/Long]
Include: Personalization, clear value, single CTA</code></pre>

<h2>Four mistakes worth naming</h2>

<ol>
  <li><strong>Too vague.</strong> "Write something good" gives the model nothing
  to optimise against.</li>
  <li><strong>Information overload.</strong> Twenty requirements in one prompt
  means the model quietly drops some. Keep it to three to five that matter.</li>
  <li><strong>Conflicting instructions.</strong> "Be brief but comprehensive and
  detailed" forces the model to pick, and it will pick wrong.</li>
  <li><strong>Missing context.</strong> "Rewrite this better" has no target.
  "Rewrite this paragraph to be more engaging for teenage readers" does.</li>
</ol>

<h2>Iterate deliberately</h2>

<p>Change one variable at a time so you learn which change caused the
improvement.</p>

<ul>
  <li>First pass: <code>Write about coffee.</code></li>
  <li>Second: <code>Write a 300-word guide on brewing the perfect espresso at
  home.</code></li>
  <li>Third: <code>Write a beginner-friendly 300-word guide on brewing espresso
  at home, including equipment needed and step-by-step instructions.</code></li>
</ul>

<p>Judge each result on four axes: does it match your intent, is it clean, does
it cover every requirement, and can you ship it with light editing. When the
answer to all four is yes, save the prompt. A personal prompt library compounds
faster than any single clever trick.</p>

<h2>Next</h2>

<ul>
  <li><a href="/articles/how-to-prompt-ai-images-videos-and-audio">How to prompt
  AI images, videos, and audio</a> — the same discipline applied to visual and
  audio generation.</li>
  <li><a href="/articles/ai-image-prompt-templates">12 AI image prompt briefs to
  hand your agent</a> — describe the job, let the agent write the prompt.</li>
</ul>
`;

const ASSET_PROMPTING = `
<p>Text prompting rewards clarity. Asset prompting rewards <em>structure</em> —
a visual model needs to know the subject, the treatment, the setting, the light,
and the framing, and it will invent whichever of those you leave out. This
tutorial covers images, video, and audio, with the prompt skeleton for each.</p>

<h2>Images</h2>

<h3>The six-part image prompt</h3>

<ol>
  <li><strong>Subject</strong> — what or who is the focus.</li>
  <li><strong>Style or medium</strong> — the rendering approach.</li>
  <li><strong>Environment</strong> — where the scene takes place.</li>
  <li><strong>Lighting and mood</strong> — atmosphere and emotional tone.</li>
  <li><strong>Composition</strong> — camera angle and framing.</li>
  <li><strong>Details</strong> — the specifics that make it yours.</li>
</ol>

<h3>Portrait</h3>

<pre><code>Subject: [person description]
Style: [portrait, fashion, editorial]
Lighting: [dramatic rim light, soft natural light, studio]
Background: [simple backdrop, environmental setting]
Mood: [professional, casual, artistic]
Details: [clothing, expression, props]</code></pre>

<p>Filled in: "Professional headshot of a confident businesswoman, studio
photography style, soft box lighting, neutral gray backdrop, warm and
approachable expression, wearing a navy blazer."</p>

<h3>Product</h3>

<pre><code>Product: [item description]
Style: [commercial, lifestyle, minimalist]
Background: [white seamless, lifestyle setting, gradient]
Lighting: [studio lights, natural window light]
Angle: [45-degree, overhead, eye-level]
Props: [complementary items, hands, lifestyle elements]</code></pre>

<p>Filled in: "Minimalist product shot of a luxury watch, pure white background,
dramatic side lighting creating reflections, 45-degree angle, emphasis on
craftsmanship details."</p>

<h3>Illustration</h3>

<pre><code>Concept: [main idea or theme]
Art style: [digital painting, vector, 3D render, anime]
Color palette: [vibrant, muted, monochrome, named colors]
Composition: [rule of thirds, centered, dynamic]
Elements: [objects, characters, effects]
Mood: [energetic, calm, mysterious, playful]</code></pre>

<p>Filled in: "Cyberpunk cityscape at night, digital matte painting style, neon
pink and blue palette, aerial perspective showing towering buildings,
holographic advertisements, flying vehicles, rain-slicked streets reflecting
lights."</p>

<h3>Match the prompt to the model</h3>

<ul>
  <li><strong>Artistic and stylised models</strong> reward style references and
  rich texture adjectives. Name the aesthetic explicitly.</li>
  <li><strong>Photorealistic models</strong> reward real-world camera language:
  "shot with 85mm lens, f/1.4, golden hour". Best choice for product and
  commercial work.</li>
  <li><strong>Concept-strong models</strong> handle metaphor and abstraction
  well, and are the ones to reach for when the image needs legible text.</li>
</ul>

<p>Using a stylised model for a photoreal headshot and then blaming the prompt
is the most common self-inflicted failure in the whole workflow.</p>

<h2>Video</h2>

<h3>The six-part video prompt</h3>

<ol>
  <li><strong>Scene</strong> — the environment and setting.</li>
  <li><strong>Camera</strong> — static, panning, zooming, tracking.</li>
  <li><strong>Action</strong> — what actually moves.</li>
  <li><strong>Style</strong> — realistic, stylised, cinematic.</li>
  <li><strong>Duration</strong> — length and pacing.</li>
  <li><strong>Transition</strong> — how the shot resolves.</li>
</ol>

<pre><code>Scene: [environment and setting]
Primary objects: [main subjects in frame]
Camera: [static, panning, zooming, tracking]
Action: [what happens]
Style: [realistic, stylized, cinematic]
Duration: [5-10 seconds]
Special effects: [particles, lighting changes]</code></pre>

<p>Filled in: "Aerial drone shot of a misty forest at sunrise, camera slowly
descending through the canopy, golden sunlight filtering through trees,
photorealistic style, 10-second smooth descent, fog particles drifting between
trees."</p>

<p>A second, tighter example: "Close-up of coffee being poured into a white
ceramic cup, slow-motion capture, steam rising dramatically, minimalist kitchen
background, smooth camera pull-back revealing breakfast table, 8 seconds, ends
with wide shot."</p>

<h3>Image to video</h3>

<p>When you animate a still, the prompt is entirely about motion. Specify
type, direction, speed, focus changes, and any added elements.</p>

<p>Filled in: "Gentle zoom into the subject's eyes with a slight clockwise
rotation, 5 seconds, add floating dust particles, subtle focus pull from
background to foreground."</p>

<h2>The filmmaking lexicon: effects you can direct on purpose</h2>

<p>Cinematic vocabulary is useful only when it changes the instruction you give
the model. "Make it cinematic" hands every decision back to the generator.
Naming the movement or optical effect tells it what changes, what stays stable,
and where the viewer should look. Use the interactive effect lab above to see
each principle before you add it to a prompt.</p>

<h3>Film grain</h3>

<p>Film grain is fine luminance and colour variation inherited from photosensitive
film stock. In generated video it can soften a clinically digital image and
help separate a memory, period setting, or documentary texture from the rest of
a sequence. Ask for the stock character and restraint: <code>fine 35mm grain,
mostly luminance noise, preserved skin detail</code>. Heavy uniform noise looks
like compression damage rather than film.</p>

<h3>Vignette</h3>

<p>A vignette gradually darkens the frame toward its edges. It guides attention
without changing the composition, but only while the viewer does not notice
the mechanism. Prompt for a <code>restrained natural vignette with preserved
edge detail</code>; avoid it when information at the edge of frame matters.</p>

<h3>Rack focus</h3>

<p>A rack focus changes the focal plane during one shot. The camera can remain
locked while attention moves from a foreground subject to a background subject,
revealing a relationship without a cut. Name both endpoints and the order:
<code>begin focused on the foreground glass, then smoothly shift focus to the
person in the doorway</code>.</p>

<h3>Dolly zoom</h3>

<p>A dolly zoom moves the camera while changing focal length in the opposite
direction. The subject stays nearly the same size while background perspective
stretches or compresses. It signals shock, unease, or a sudden change in
perception. A usable instruction specifies both coordinated moves: <code>dolly
backward while zooming in, keep the subject size locked, let the corridor
expand behind them</code>.</p>

<h3>Whip pan</h3>

<p>A whip pan crosses the scene fast enough to create directional motion blur.
It adds energy, redirects attention, or hides a transition between two shots
with matched direction. Include the launch direction, landing subject, and
speed curve: <code>fast left-to-right whip pan, clean acceleration, settle on
the product in a stable final frame</code>.</p>

<h3>Colour grade</h3>

<p>Colour grading shapes contrast and colour after capture. Describe a
relationship rather than one global tint: <code>warm amber highlights, slightly
cool shadows, natural skin tones, neutral whites</code>. That gives the model a
palette while preserving believable materials.</p>

<h3>Combine effects with one visual priority</h3>

<p>Effects multiply each other. A dolly zoom, heavy grain, hard vignette, flare,
and aggressive grade in the same five-second clip give the viewer five competing
instructions. Start with one narrative job, choose the effect that performs it,
and add a second only when it supports the first.</p>

<pre><code>Scene: A founder alone in a bright office after the team leaves.
Camera: Slow dolly backward while zooming in; keep the founder the same size.
Focus: Founder remains sharp; background perspective expands.
Grade: Restrained cool shadows with neutral skin tones.
Texture: Fine 35mm luminance grain at low strength.
Duration: 6 seconds, smooth movement, stable final frame.</code></pre>

<h2>Audio</h2>

<h3>Voice</h3>

<pre><code>Voice profile: [speaker characteristics or voice ID]
Style/Emotion: [calm, energetic, professional, friendly]
Pacing: [slow and deliberate, conversational, quick and upbeat]
Tone: [warm, authoritative, playful, serious]
Language/Accent: [American English, British English]
Special instructions: [emphasis, pauses]</code></pre>

<p>Filled in: "Professional female narrator, warm and engaging tone, medium pace
with clear articulation, American English, slight emphasis on key product
benefits, natural pauses between sentences."</p>

<h3>Music</h3>

<pre><code>Genre: [electronic, orchestral, jazz, ambient]
Mood: [uplifting, mysterious, energetic, calm]
Instruments: [instruments to feature]
Tempo: [slow 60-80 BPM, medium 90-120 BPM, fast 130+ BPM]
Duration: [seconds]
Use case: [background, intro/outro, emotional scene]</code></pre>

<p>Filled in: "Uplifting corporate background music, electronic genre with piano
melody, medium tempo 110 BPM, positive and inspiring mood, light percussion, 30
seconds, for a product showcase."</p>

<h2>Four techniques that raise the ceiling</h2>

<h3>Progressive refinement</h3>

<p>"Mountain landscape" becomes "mountain landscape at sunset" becomes
"majestic mountain range at golden hour, dramatic clouds, alpine lake in
foreground reflecting the sky, wide-angle lens, high dynamic range". Each pass
adds one dimension.</p>

<h3>Style mixing</h3>

<p>Two named aesthetics in collision produce something neither would alone:
"cyberpunk meets Art Nouveau", "minimalist Japanese ink painting with modern
elements", "retro 80s aesthetic with contemporary fashion".</p>

<h3>Emotional framing</h3>

<p>"Joyful celebration" outperforms "people at a party". "Melancholic solitude"
outperforms "person alone". Emotion words carry compositional information that
nouns do not.</p>

<h3>Technical specification</h3>

<ul>
  <li><strong>Photography</strong>: 85mm f/1.4, bokeh background, golden hour.</li>
  <li><strong>Video</strong>: 24fps cinematic, anamorphic lens flares, handheld.</li>
  <li><strong>Digital art</strong>: 4K, highly detailed, octane render.</li>
</ul>

<h2>Mistakes to avoid</h2>

<ul>
  <li><strong>Too vague.</strong> "Make a nice picture" has no target.</li>
  <li><strong>Contradictions.</strong> "Bright darkness" forces an arbitrary
  pick. Say "dimly lit scene with a single bright light source" instead.</li>
  <li><strong>Overloading.</strong> Fifty descriptors dilute each other. Five to
  seven that reinforce one another beat fifty that fight.</li>
  <li><strong>Ignoring model strengths.</strong> See the model-matching note
  above.</li>
</ul>

<h2>Cheat sheet</h2>

<ul>
  <li><strong>Quality</strong>: ultra-detailed, high-resolution, professional,
  premium.</li>
  <li><strong>Lighting</strong>: dramatic, soft, natural, studio, golden hour.</li>
  <li><strong>Mood</strong>: cinematic, ethereal, vibrant, moody, energetic.</li>
  <li><strong>Style</strong>: photorealistic, stylised, artistic, minimalist,
  abstract.</li>
  <li><strong>Composition</strong>: rule of thirds, symmetrical, dynamic,
  centered.</li>
</ul>

<p>Change one element per iteration, compare outputs from more than one model,
and save every prompt that works. The library is the asset, not any individual
image.</p>
`;

const IMAGE_PROMPT_TEMPLATES = `
<p>Fill-in-the-blank prompt templates have a failure mode nobody admits to:
almost nobody fills them in. The brackets survive into the generator, and
<code>[YOUR_PRODUCT]</code> comes back rendered as literal text on a shopping
bag. Even when someone does replace them, they replace them badly — the
template asks for a lighting type and gets "good lighting".</p>

<p>So these twelve are not templates. They are <strong>briefs you hand to an
agent</strong>. Each one states the job, hands the creative decisions to
whatever already knows your brand, and pins the two or three constraints that
actually break the image if they slip. The agent writes the prompt. You run the
prompt.</p>

<h2>How to run a brief</h2>

<ol>
  <li>Paste the brief into your Genfeed agent, or any agent holding your brand
  context — palette, product photography, audience, tone.</li>
  <li>The agent returns a finished image prompt with every specific already
  chosen.</li>
  <li>Read it. Change anything you disagree with — you are reviewing a draft,
  not accepting an oracle.</li>
  <li>Run it in your image model.</li>
</ol>

<p>The agent supplies what a template structurally cannot: it knows your palette
is warm neutrals, that your audience skews B2B, that your last six product shots
used hard side light. A bracket cannot know any of that, which is why the brief
outperforms the template even when the template is filled in honestly.</p>

<p>If you want the reasoning underneath — why lighting, style, and composition
have to be named at all — start with
<a href="/articles/how-to-prompt-ai-images-videos-and-audio">how to prompt AI
images, videos, and audio</a>.</p>

<h2>1. Product shot</h2>

<p>Drops your product into a real scene with light that agrees.</p>

<pre><code>Write one image-generation prompt for a product shot placing our hero
product in a real-world scene.

Choose the scene, camera angle, and lighting from what you know about our
brand and who buys from us. Non-negotiable: shadow direction and colour
temperature on the product must match the scene's light source, and the
product's shape, materials, and branding stay unmodified.

Return the prompt only, as a single paragraph.</code></pre>

<h2>2. Model and product</h2>

<pre><code>Write one image-generation prompt for an advertising shot of a person
using our product.

Pick the model's demographic, wardrobe, pose, and setting to match who
actually buys from us, not who we wish bought from us. Non-negotiable: the
product stays unobstructed and recognisable at thumbnail size.

Return the prompt only.</code></pre>

<h2>3. Colourways</h2>

<pre><code>Write one image-generation prompt rendering our product in a new colourway
drawn from our brand palette.

Choose the colour and where it is applied. Non-negotiable: silhouette,
materials, hardware, and logo placement stay identical to the reference —
colour is the only thing that changes.

Return the prompt only.</code></pre>

<h2>4. Background swap</h2>

<pre><code>Write one image-generation prompt moving an existing subject of ours into
a new background.

Choose a background that fits the campaign we are currently running.
Non-negotiable: re-light the subject to match the new scene — edge light,
contact shadow, and colour cast all have to agree, or the composite reads
as a cut-out.

Return the prompt only.</code></pre>

<h2>5. Style transfer</h2>

<pre><code>Write one image-generation prompt restyling an existing image of ours.

Choose a style our audience reads as quality rather than as novelty. Name
the medium, the era, and the surface qualities explicitly; do not name a
living artist. Non-negotiable: the subject stays recognisable.

Return the prompt only.</code></pre>

<h2>6. Scene composite</h2>

<pre><code>Write one image-generation prompt combining two of our reference images
into a single scene.

State explicitly which element comes from which reference, and decide which
reference sets the lighting. Non-negotiable: one light direction and one
colour temperature across the whole frame.

Return the prompt only.</code></pre>

<h2>7. Hero banner</h2>

<p>Wide compositions need deliberate empty space, or the headline lands on
someone's face.</p>

<pre><code>Write one image-generation prompt for a wide hero banner for our current
campaign.

Choose subject, style, and palette from our brand. Non-negotiable: the
subject sits on one third, the opposite third stays clean negative space
for a headline, and nothing load-bearing falls in the top 15% where the
navigation sits. State the aspect ratio inside the prompt.

Return the prompt only.</code></pre>

<h2>8. Video thumbnail</h2>

<pre><code>Write one image-generation prompt for a 16:9 thumbnail for our next video.

You know the topic and our channel's visual language — set expression,
colour, and framing from that. Non-negotiable: high contrast, one focal
subject filling one half, the other half clean for a text overlay, and the
whole thing legible at 320px wide.

Return the prompt only.</code></pre>

<h2>9. Flat lay</h2>

<pre><code>Write one image-generation prompt for an overhead flat lay of our products.

Choose which items, the surface, and the arrangement. Non-negotiable: even
diffused light with minimal shadow, our brand palette, and one clear empty
region reserved for copy.

Return the prompt only.</code></pre>

<h2>10. Character consistency</h2>

<p>The one brief that returns two artefacts. The identity block is the asset —
the scene prompt is disposable.</p>

<pre><code>Write two things for our recurring character: a reusable identity block,
and one scene prompt that uses it.

The identity block fixes age, build, hair, eyes, distinguishing features,
wardrobe, and render style in specific, repeatable language — no adjectives
a second reader could interpret differently. The scene prompt varies only
setting and action.

Save the identity block to brand context so every future generation reuses
it verbatim.</code></pre>

<h2>11. Explainer graphic</h2>

<pre><code>Write one image-generation prompt for a diagram explaining a single concept
from our product.

Choose the concept, the number of stages, and the wording of each label.
Non-negotiable: flat vector, our brand palette, generous whitespace, no
decorative clutter, and every label spelled out verbatim in the prompt so
the model does not invent its own text.

Return the prompt only.</code></pre>

<h2>12. Seasonal adaptation</h2>

<pre><code>Write one image-generation prompt adapting an existing campaign image of
ours for the season we are heading into.

Choose the seasonal cues and how far to shift palette and light quality.
Non-negotiable: the product's shape, materials, and branding are untouched,
and seasonal elements never overlap the product.

Return the prompt only.</code></pre>

<h2>When to overrule the agent</h2>

<p>The brief hands over the creative decisions on purpose, but three of them are
worth taking back by hand:</p>

<ul>
  <li><strong>Anything legally load-bearing.</strong> Claims, certifications,
  and pack copy get typed by you, not inferred.</li>
  <li><strong>A look you have already validated.</strong> If a shot converted,
  pin its lighting and framing in the brief instead of re-rolling the dice.</li>
  <li><strong>Faces you reuse.</strong> Character identity belongs in a saved
  identity block, not in whatever the agent improvises this session.</li>
</ul>

<p>Everything else is better delegated. An agent that has read your last fifty
posts has a sharper sense of your visual language than a bracket does — and,
unlike a bracket, it never ships to the generator unfilled.</p>
`;

const INSTAGRAM_GROWTH = `
<p>AI generation solves the supply problem: you can produce a month of visuals
in an afternoon. It does not solve the distribution problem. This is the second
half — what to post, when, and how Instagram decides who sees it.</p>

<p>For connecting the account itself, the OAuth requirements and media
specifications are in the
<a href="https://docs.genfeed.ai/guides/publishing/social-media/instagram">Instagram
connector reference</a>.</p>

<h2>How ranking actually works</h2>

<p>Instagram ranks each post per viewer, against six signals:</p>

<ol>
  <li><strong>Relationship</strong> — the viewer's past interactions with you.</li>
  <li><strong>Interest</strong> — their predicted likelihood of engaging.</li>
  <li><strong>Timeliness</strong> — how recent the post is.</li>
  <li><strong>Frequency</strong> — how often they open the app.</li>
  <li><strong>Following</strong> — how many accounts compete for their feed.</li>
  <li><strong>Usage</strong> — how long their sessions run.</li>
</ol>

<p>Four of the six are properties of the viewer, not of you. That is the whole
strategic point: you cannot out-post the algorithm, you can only make the two
signals you control — relationship and interest — as strong as possible for a
specific audience.</p>

<h2>When to post</h2>

<ul>
  <li><strong>Weekdays</strong>: 11am–1pm and 5pm–7pm.</li>
  <li><strong>Weekends</strong>: 10am–11am.</li>
  <li><strong>Time zones</strong>: publish when <em>your</em> audience is
  online, which your account insights will tell you directly.</li>
  <li><strong>Consistency</strong> beats optimality. The same slot every day
  trains both the audience and the ranking model.</li>
</ul>

<h2>Hashtags</h2>

<ul>
  <li>Thirty is the cap. Treating the cap as a target is not a strategy.</li>
  <li>Mix broad tags with niche ones — the niche tags are where a small account
  can actually rank.</li>
  <li>Caption or first comment both work. Pick one and stay consistent.</li>
  <li>Research with Instagram's own search before committing to a set.</li>
  <li>One branded campaign tag gives you a collection point for
  user-generated content.</li>
</ul>

<h2>Content that earns distribution</h2>

<ol>
  <li><strong>Visual consistency.</strong> A recognisable palette and treatment
  makes your posts identifiable mid-scroll. This is where AI generation is
  strongest — lock a style prompt and reuse it.</li>
  <li><strong>Longer captions.</strong> Captions over 1,000 characters routinely
  outperform one-liners, because dwell time is a signal.</li>
  <li><strong>Ask for saves and shares</strong>, not likes. Saves are the
  highest-weight action available to you.</li>
  <li><strong>Repost user content</strong> with permission. It converts
  followers into contributors.</li>
  <li><strong>Show process.</strong> Behind-the-scenes posts consistently
  outperform polished output, which is a useful corrective if you are generating
  everything with AI.</li>
</ol>

<h2>Growth tactics that hold up</h2>

<ul>
  <li>Publish when your audience is most active, not when you happen to
  finish.</li>
  <li>Optimise for meaningful interaction — comments and DMs — over vanity
  metrics.</li>
  <li>Use every format. Posts, Reels, and Stories reach different slices of your
  audience and Instagram rewards accounts that use all three.</li>
  <li>Reply fast. The first hour of comment activity disproportionately affects
  reach.</li>
  <li>Collaborate with adjacent accounts rather than competing ones.</li>
  <li>Build episodic series so viewers have a reason to return.</li>
  <li>Go live regularly — real-time engagement is weighted heavily.</li>
</ul>

<h2>A workable weekly loop</h2>

<ol>
  <li>Generate a batch of on-brand visuals from one locked style prompt.</li>
  <li>Write captions with an explicit hook, a payoff, and a save-oriented
  call-to-action.</li>
  <li>Schedule into your two best-performing slots.</li>
  <li>Block twenty minutes after each post goes live for replies.</li>
  <li>At the end of the week, read reach and saves — not likes — and drop the
  format that underperformed.</li>
</ol>

<p>Repeat that loop for eight weeks before you conclude anything. Instagram
growth data is extremely noisy at low volume, and most "the algorithm changed"
diagnoses are variance.</p>
`;

const TIKTOK_GROWTH = `
<p>TikTok is the platform where a first post can outrun a hundred-thousand
follower account, because distribution is decided per-video rather than
per-account. That makes it the highest-leverage surface for AI-generated video —
and the least forgiving of a weak first three seconds.</p>

<p>Account connection, video specifications, and troubleshooting live in the
<a href="https://docs.genfeed.ai/guides/publishing/social-media/tiktok">TikTok
connector reference</a>.</p>

<h2>What the algorithm weighs</h2>

<ol>
  <li><strong>Completion rate</strong> — the share of viewers who reach the
  end.</li>
  <li><strong>Engagement</strong> — likes, comments, shares.</li>
  <li><strong>Re-watches</strong> — multiple views from one viewer.</li>
  <li><strong>Total time spent</strong> on the video.</li>
  <li><strong>Creator consistency</strong> — how regularly you publish.</li>
</ol>

<p>Completion rate dominates, and it is the reason short videos win: a 15-second
video that 70% of viewers finish beats a 3-minute video that 12% finish, even
though the long one accumulated more watch seconds per viewer.</p>

<h2>Earning the For You page</h2>

<ul>
  <li>Hook in the first three seconds. Not "hello and welcome" — state the
  payoff immediately.</li>
  <li>Use trending sounds and effects while they are still ascending.</li>
  <li>Post at peak hours for your audience.</li>
  <li>Reply to comments within the first hour.</li>
  <li>Stay narrow. A niche account is easier for the model to route.</li>
</ul>

<h2>Cadence and length</h2>

<ul>
  <li><strong>Frequency</strong>: one to four posts daily. This is a volume
  platform, which is precisely why generated video changes the economics.</li>
  <li><strong>Timing</strong>: 6–9am, 12–3pm, and 7–11pm are the standard
  windows.</li>
  <li><strong>Length</strong>: 15–30 seconds performs best for most niches.</li>
  <li><strong>Series</strong>: episodic content converts a single viewer into a
  repeat viewer.</li>
  <li><strong>Trends</strong>: joining early is worth far more than joining
  well.</li>
</ul>

<h2>Hashtags</h2>

<ul>
  <li>Three to five, not thirty.</li>
  <li>Mix one trending, two niche, one branded.</li>
  <li>Put them in the description, not the comments.</li>
  <li>Check view counts before committing — a tag with 40 billion views is not
  a distribution channel, it is a lottery.</li>
</ul>

<h2>Formats that work</h2>

<ol>
  <li><strong>Educational</strong> — one fact or one technique, delivered
  fast.</li>
  <li><strong>Entertainment</strong> — comedy and timing-driven formats.</li>
  <li><strong>Process</strong> — showing how something is made.</li>
  <li><strong>Challenges</strong> — join one or start one.</li>
  <li><strong>Transitions</strong> — the format most improved by generated
  assets, since you can produce matching frames on demand.</li>
</ol>

<h2>Production floor</h2>

<ul>
  <li>Good lighting, natural where possible.</li>
  <li>Clean audio. Bad audio kills completion rate faster than bad video.</li>
  <li>Stable framing.</li>
  <li>Vertical, always. 9:16 or it does not exist.</li>
  <li>Native effects and captions — the platform surfaces what looks native to
  it.</li>
</ul>

<h2>Engagement mechanics</h2>

<ul>
  <li>Reply to comments <em>with videos</em>. Each reply is a new post with a
  built-in hook.</li>
  <li>Go live once you have the follower threshold for it.</li>
  <li>Make content that invites duets and stitches.</li>
  <li>Ask a real question in the video, not "let me know in the comments".</li>
</ul>

<h2>Growth plan</h2>

<ol>
  <li><strong>Niche down</strong> until you can describe the account in six
  words.</li>
  <li><strong>Post daily</strong> for sixty days before evaluating.</li>
  <li><strong>Cross-promote</strong> your best performers to Reels and
  Shorts — the same vertical asset works on all three.</li>
  <li><strong>Study your analytics</strong> for your real peak windows rather
  than published averages.</li>
  <li><strong>A/B test hooks</strong> specifically. Same video, two openings,
  posted a week apart.</li>
</ol>

<p>The compounding advantage of generated video here is not that any single
video is better. It is that you can afford sixty attempts instead of six, and on
a per-video distribution model, attempts are the input that matters.</p>
`;

const LINKEDIN_GROWTH = `
<p>LinkedIn rewards a narrower band of content than any other major platform: it
wants specific, credible, professionally useful writing, and it punishes anything
that reads like an advert. That constraint is good news — it means the bar is
clarity, not production budget.</p>

<p>Connection, account types, media specifications, and analytics are in the
<a href="https://docs.genfeed.ai/guides/publishing/social-media/linkedin">LinkedIn
connector reference</a>.</p>

<h2>What the algorithm weighs</h2>

<ol>
  <li><strong>Dwell time</strong> — how long people actually read.</li>
  <li><strong>Early engagement</strong> — the first hour is decisive.</li>
  <li><strong>Comments</strong>, valued well above likes.</li>
  <li><strong>Creator authority</strong> in the topic you are posting about.</li>
  <li><strong>Originality</strong> — recycled insight travels poorly.</li>
</ol>

<p>Dwell time being the top signal explains most of LinkedIn's stylistic
conventions: short paragraphs, a line break before the fold, an opening that
makes the "see more" click worth it.</p>

<h2>When to post</h2>

<ul>
  <li><strong>Best days</strong>: Tuesday through Thursday.</li>
  <li><strong>Morning</strong>: 7:30–9:00am.</li>
  <li><strong>Midday</strong>: 12:00–1:00pm.</li>
  <li><strong>Evening</strong>: 5:00–6:00pm.</li>
  <li>Weight toward whichever time zone holds most of your network.</li>
</ul>

<h2>Content strategy</h2>

<ol>
  <li><strong>Value first.</strong> Share the insight, not the announcement.
  Promotion works only as a footnote to something useful.</li>
  <li><strong>Tell a specific story.</strong> First-person experience with real
  detail outperforms generalised advice by a wide margin.</li>
  <li><strong>Comment on industry news</strong> while it is still news, with a
  take rather than a summary.</li>
  <li><strong>Ask real questions.</strong> Comments are the highest-weight
  signal, so write posts that need answering.</li>
  <li><strong>Use visuals.</strong> Posts with images or native video see
  roughly double the engagement of text alone.</li>
</ol>

<h2>Tone</h2>

<ul>
  <li>Sparing emoji.</li>
  <li>Correct grammar — the audience notices.</li>
  <li>Credible sources, linked.</li>
  <li>Authenticity over polish. This is the one place where AI-written copy is
  most obviously AI-written, so edit hard.</li>
  <li>Respect for disagreement in the comments.</li>
</ul>

<h2>Visibility boosters</h2>

<ul>
  <li>Answer every comment in the first hour.</li>
  <li>Tag people sparingly and only when genuinely relevant — over-tagging is
  penalised.</li>
  <li>Upload video natively rather than linking out.</li>
  <li>Open with a line that earns the click on "see more".</li>
</ul>

<h2>What to write about</h2>

<p><strong>As an individual:</strong> industry trends with a position attached,
career lessons that cost you something, post-mortems, tools you actually
switched to, and genuine thought leadership rather than restated consensus.</p>

<p><strong>As a company:</strong> culture with specifics, product launches with
the reasoning behind them, domain expertise, employee spotlights, and the
process behind the output.</p>

<h2>Compounding growth</h2>

<ol>
  <li><strong>Connect strategically.</strong> A relevant network of 500 beats an
  irrelevant one of 5,000, because interest prediction is per-viewer.</li>
  <li><strong>Comment on other people's posts daily.</strong> This is the single
  most underrated growth mechanism on the platform.</li>
  <li><strong>Publish long-form articles</strong> for depth that the feed cannot
  hold.</li>
  <li><strong>Join and actually participate</strong> in a small number of
  groups.</li>
  <li><strong>Keep a fixed schedule.</strong> Two considered posts a week beat
  seven filler ones.</li>
  <li><strong>Mentor publicly.</strong> Answering a beginner's question in
  public is high-value content that costs you nothing to produce.</li>
</ol>

<p>Generated drafts are useful here as a starting structure, but LinkedIn is the
platform where the last 20% of human editing carries most of the value. Generate
the skeleton; write the specifics yourself.</p>
`;

const YOUTUBE_GROWTH = `
<p>YouTube is a search engine with a recommendation layer on top. That single
fact should determine most of your decisions: titles are queries, thumbnails are
the click decision, and the first fifteen seconds decide whether the
recommendation engine ever shows the video again.</p>

<p>Channel connection, upload permissions, formats, and analytics are covered in
the <a href="https://docs.genfeed.ai/guides/publishing/social-media/youtube">YouTube
connector reference</a>.</p>

<h2>Titles</h2>

<ul>
  <li>Put the main keyword in the first 60 characters — that is what survives
  truncation across surfaces.</li>
  <li>Write the title as something a person would actually type or ask.</li>
  <li>Curiosity works; misleading does not. Retention punishes the gap between
  promise and delivery within about 30 seconds.</li>
</ul>

<h2>Thumbnails</h2>

<ul>
  <li>High contrast, and legible at 320px wide.</li>
  <li>A clear face with a readable expression, or a single dramatic focal
  point.</li>
  <li>Minimal text — three or four words at most.</li>
  <li>Thumbnail and title should complement each other rather than repeat the
  same information.</li>
</ul>

<p>Thumbnails are the highest-return use of AI image generation on this
platform: you can produce five variants of the same concept and test them
instead of committing to your first idea.</p>

<h2>Descriptions and tags</h2>

<ul>
  <li>The first 125 characters carry the weight — they appear in search
  results.</li>
  <li>Add timestamped chapters. They improve both retention and search
  surfacing.</li>
  <li>Include the relevant links and one clear call to action.</li>
  <li>Tags should mix broad category terms with specific long-tail ones.</li>
</ul>

<h2>Publishing rhythm</h2>

<ul>
  <li><strong>Consistency</strong>: same day and time each week, so subscribers
  form a habit.</li>
  <li><strong>Timing</strong>: 2–4pm on weekdays is the common sweet spot.</li>
  <li><strong>Frequency</strong>: one to three videos a week suits most
  channels. More than that usually costs you retention.</li>
  <li><strong>Playlists</strong>: group related videos into series so a single
  viewer session covers several uploads.</li>
</ul>

<h2>Retention</h2>

<ol>
  <li><strong>Hook within fifteen seconds.</strong> State what the viewer gets
  and why it is worth staying for.</li>
  <li><strong>Cut the preamble.</strong> No channel intro animation before the
  hook.</li>
  <li><strong>Re-hook at each chapter boundary</strong>, where drop-off
  concentrates.</li>
  <li><strong>Watch your retention graph</strong> per video. Cliffs are
  instructions.</li>
</ol>

<h2>Engagement</h2>

<ul>
  <li>Ask a question specific enough to answer in one line.</li>
  <li>Post community updates between uploads to stay in the subscription
  feed.</li>
  <li>Use cards and end screens to route viewers into a second video — session
  length is a ranking input.</li>
  <li>Reply to early comments; the first hour matters here too.</li>
</ul>

<h2>Shorts</h2>

<p>Shorts and long-form are ranked separately, so treat them as two channels
sharing a name. Shorts are a discovery surface: a vertical cut of an existing
video costs almost nothing to produce and reaches an audience the long-form
recommendation engine will not.</p>

<h2>Growth plan</h2>

<ol>
  <li><strong>Publish consistently</strong> for at least twenty videos before
  drawing conclusions.</li>
  <li><strong>Research keywords</strong> before you script, not after you
  upload.</li>
  <li><strong>Reply to your audience</strong>, especially early on when every
  comment is a real person.</li>
  <li><strong>Collaborate</strong> with channels serving an adjacent
  audience.</li>
  <li><strong>Read the analytics</strong> — click-through rate tells you about
  the thumbnail, average view duration tells you about the video. Fix the one
  the data points at.</li>
</ol>

<p>Almost every channel that stalls is optimising the wrong half: making better
videos when the click-through rate is 2%, or making better thumbnails when
viewers leave at 0:20. Let the two numbers tell you which problem you
have.</p>
`;

export const RETIRED_OSS_LAUNCH_PLAYBOOK = `
<p>Launching an open-source product is not one launch. It is two, staged a week
or two apart, aimed at audiences that want opposite things: Hacker News wants
the architecture and the honest caveats, Product Hunt wants the outcome and the
screenshots. This is the operating playbook — gates, timing, copy structure, and
what to measure.</p>

<h2>Do not launch until the gate closes</h2>

<p>Pick one end-to-end walkthrough that represents the product actually working
— install, first meaningful action, visible result — and make passing it the
precondition for scheduling anything. A launch that sends traffic to a broken
quick start converts curiosity into a permanent negative impression, and you
only get the attention once.</p>

<p>Once that gate is green:</p>

<ol>
  <li>Schedule Show HN for the first Tuesday, Wednesday, or Thursday morning in
  your primary audience's time zone.</li>
  <li>Schedule Product Hunt 8–14 days later, starting at 12:01am Pacific.</li>
  <li>Freeze copy and gallery assets 48 hours before each submission.</li>
  <li>Keep a human online for the first two hours after each.</li>
</ol>

<h2>Readiness checklist</h2>

<p>Every row needs public evidence, not an assurance.</p>

<table>
  <thead>
    <tr><th>Area</th><th>Required outcome</th></tr>
  </thead>
  <tbody>
    <tr><td>README</td><td>Explains the product, quick start, architecture, links, license, and contribution path.</td></tr>
    <tr><td>Demo media</td><td>A GIF or screenshots showing the core loop end to end, not a static hero image.</td></tr>
    <tr><td>Architecture overview</td><td>Public docs describe the boundaries between the open core and anything commercial.</td></tr>
    <tr><td>Quick start</td><td>A clean-clone install has actually been run, by someone who is not you if possible.</td></tr>
    <tr><td>Screenshots</td><td>Current UI, never mockups. Reviewers notice.</td></tr>
    <tr><td>CONTRIBUTING</td><td>Branch policy, checks, and PR expectations are public.</td></tr>
    <tr><td>Issue templates</td><td>Bug and feature reports guide contributors without exposing private process.</td></tr>
    <tr><td>Analytics</td><td>Attribution is wired <em>before</em> traffic arrives, not during.</td></tr>
  </tbody>
</table>

<h2>Ground rules</h2>

<ul>
  <li>Keep submissions factual. No unannounced roadmap commitments, no customer
  names you have not cleared, no internal pricing.</li>
  <li><strong>Never automate Hacker News</strong> posting, comments, replies, or
  voting. Draft copy with whatever tools you like; the posting and the
  conversation stay human. This is both a site rule and the difference between a
  launch and a ban.</li>
  <li>Redact secrets, customer data, billing identifiers, and private analytics
  from every screenshot.</li>
</ul>

<h2>Attribution</h2>

<p>Use one campaign name across every channel so the cohort is comparable:</p>

<pre><code>utm_campaign=oss_launch</code></pre>

<table>
  <thead>
    <tr><th>Channel</th><th>Source</th><th>Medium</th></tr>
  </thead>
  <tbody>
    <tr><td>Show HN submission</td><td>hacker_news</td><td>show_hn</td></tr>
    <tr><td>Show HN first comment</td><td>hacker_news</td><td>comment</td></tr>
    <tr><td>Product Hunt link</td><td>product_hunt</td><td>launch</td></tr>
    <tr><td>Maker comment</td><td>product_hunt</td><td>comment</td></tr>
    <tr><td>Launch article</td><td>devto</td><td>article</td></tr>
    <tr><td>X thread</td><td>x</td><td>social</td></tr>
    <tr><td>LinkedIn post</td><td>linkedin</td><td>social</td></tr>
  </tbody>
</table>

<p>Track stars from baseline to T+24h, T+72h, and T+7d; signups carrying launch
UTMs; activation within the launch cohort; and self-hosting signals such as
quick-start page views, image pulls, and issues opened by new visitors.</p>

<h2>Show HN</h2>

<h3>The submission</h3>

<p>Link the public repository or public docs. Never a staging URL. Keep the
title plain and descriptive — Hacker News titles that try to sell get flagged,
and titles that just say what the thing is do fine.</p>

<pre><code>Show HN: [Product] - [what it is in five words]</code></pre>

<h3>The first comment</h3>

<p>Post it yourself, immediately, and structure it in four parts:</p>

<ol>
  <li><strong>What you built and why</strong>, in two sentences.</li>
  <li><strong>What is actually in the repo</strong> — concrete capabilities, not
  adjectives.</li>
  <li><strong>How it runs</strong>: the self-hosting path, the dependencies, and
  where any commercial boundary sits. Be explicit about the licence split;
  ambiguity here is the fastest route to a hostile thread.</li>
  <li><strong>What feedback you want.</strong> Naming a specific question gets
  you specific answers.</li>
</ol>

<h3>Prepared answers</h3>

<p>Have short, factual replies ready for: can I self-host it, do I need a cloud
account, what is the licence, how do I contribute, and how does it compare to
the obvious incumbent. Answer the comparison question honestly — including where
you lose — because the thread will find out either way and being first is worth
more than being flattering.</p>

<h2>Product Hunt</h2>

<p>Run it one to two weeks after Show HN. The delay lets you fold in HN
feedback, refresh screenshots, and avoid splitting the conversation across two
audiences on the same day.</p>

<h3>Product page</h3>

<p>Write four tagline candidates and pick the one that would make sense to
someone who has never heard of the category. Keep the short description to two
sentences: what it is, and how you run it.</p>

<h3>Maker comment</h3>

<p>Different audience, different register from HN. Lead with the problem you
personally had, describe the loop your product closes, and end by asking for
feedback from the specific kind of user you want.</p>

<h3>Gallery</h3>

<table>
  <thead>
    <tr><th>Asset</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr><td>Hero image</td><td>Explain the category in one frame, using real UI.</td></tr>
    <tr><td>Core workflow</td><td>Show the main loop with readable labels.</td></tr>
    <tr><td>Fast win</td><td>Show the thing that takes ten seconds and feels good.</td></tr>
    <tr><td>Planning surface</td><td>Show the product in use over time, with demo data.</td></tr>
    <tr><td>Integrations</td><td>Show what it connects to, no private handles.</td></tr>
    <tr><td>Self-hosting proof</td><td>Terminal or architecture, free of secrets.</td></tr>
  </tbody>
</table>

<h2>Launch-day schedule</h2>

<table>
  <thead>
    <tr><th>Time</th><th>Action</th></tr>
  </thead>
  <tbody>
    <tr><td>T-48h</td><td>Freeze copy, screenshots, and links.</td></tr>
    <tr><td>T-24h</td><td>Confirm the product page, maker access, gallery, and UTM links.</td></tr>
    <tr><td>12:01am PT</td><td>Launch.</td></tr>
    <tr><td>First 2h</td><td>Reply to everything. Ship doc fixes live. Write down every objection.</td></tr>
    <tr><td>First 24h</td><td>Publish the technical article and owned-channel posts.</td></tr>
    <tr><td>T+24h</td><td>Record traffic, stars, signups, activation, self-hosting signals.</td></tr>
    <tr><td>T+7d</td><td>Publish the retrospective and link the follow-up issues.</td></tr>
  </tbody>
</table>

<h2>Launch-week content calendar</h2>

<table>
  <thead>
    <tr><th>Day</th><th>Channel</th><th>Content</th></tr>
  </thead>
  <tbody>
    <tr><td>D-7</td><td>Blog</td><td>Why the project is open source and self-hostable.</td></tr>
    <tr><td>D-5</td><td>X</td><td>Build-in-public thread with a quick-start GIF.</td></tr>
    <tr><td>D-3</td><td>LinkedIn</td><td>Founder and use-case post.</td></tr>
    <tr><td>D-1</td><td>GitHub</td><td>README, screenshots, and issue templates frozen.</td></tr>
    <tr><td>D0</td><td>Hacker News</td><td>Show HN submission and first comment.</td></tr>
    <tr><td>D+1</td><td>Technical blog</td><td>Architecture and setup walkthrough.</td></tr>
    <tr><td>D+3</td><td>X and LinkedIn</td><td>What the HN feedback changed.</td></tr>
    <tr><td>D+8 to D+14</td><td>Product Hunt</td><td>Launch page and maker comment.</td></tr>
    <tr><td>D+15</td><td>Blog</td><td>Public retrospective with results and next steps.</td></tr>
  </tbody>
</table>

<h2>Measure against a baseline</h2>

<p>Record stars, forks, signups, activated users, image pulls, and quick-start
views <em>before</em> the first submission. Without a baseline every post-launch
number is unreadable. Define activation concretely — a launch-cohort user who
completes the product's first real action — and treat it as the only number that
predicts anything about week four.</p>

<h2>Final pre-submit checklist</h2>

<ul>
  <li>The end-to-end walkthrough gate is green and linked.</li>
  <li>README, screenshots, architecture docs, CONTRIBUTING, and issue templates
  have public review evidence.</li>
  <li>A clean-clone install has been run and the transcript is saved.</li>
  <li>Show HN title and first comment are written and reviewed.</li>
  <li>Product Hunt tagline, maker comment, and gallery are reviewed.</li>
  <li>UTM links and analytics views are confirmed working.</li>
  <li>Launch-week posts are drafted and scheduled.</li>
  <li>Baseline metrics are recorded.</li>
</ul>

<p>The playbook is deliberately boring. Launches fail on unglamorous things — a
broken install command, an unanswered licence question, no attribution on the
one day traffic actually arrives — far more often than on positioning.</p>
`;

const ORIGINAL_LAUNCH_BATCH_PUBLISHED_AT = '2026-08-13T01:38:45.528Z';

export const RETIRED_ARTICLE_SLUGS = [
  'how-to-launch-an-open-source-product-on-show-hn-and-product-hunt',
] as const;

export const LAUNCH_ARTICLES: readonly SeedArticle[] = [
  {
    category: ArticleCategory.TUTORIAL,
    content: CLEAR_FRAMEWORK,
    coverImageUrl: articleArtwork('how-to-prompt-ai-content-clear-framework'),
    label: 'How to prompt AI content: the CLEAR framework',
    publishedAt: '2026-07-21T09:00:00.000Z',
    slug: 'how-to-prompt-ai-content-clear-framework',
    summary:
      'A repeatable prompt structure — context, length, expectations, audience, role — plus the four mistakes behind most unusable AI output.',
  },
  {
    category: ArticleCategory.TUTORIAL,
    content: ASSET_PROMPTING,
    coverImageUrl: articleArtwork('how-to-prompt-ai-images-videos-and-audio'),
    label: 'How to prompt AI images, videos, and audio',
    publishedAt: '2026-07-23T09:00:00.000Z',
    slug: 'how-to-prompt-ai-images-videos-and-audio',
    summary:
      'Prompt skeletons for image, video, and audio generation, plus an interactive filmmaking lexicon for previewing and applying cinematic effects.',
  },
  {
    category: ArticleCategory.LISTICLE,
    content: IMAGE_PROMPT_TEMPLATES,
    coverImageUrl: articleArtwork('ai-image-prompt-templates'),
    label: '12 AI image prompt briefs to hand your agent',
    publishedAt: '2026-07-28T09:00:00.000Z',
    slug: 'ai-image-prompt-templates',
    summary:
      'Twelve image briefs you hand to an agent that already knows your brand. It writes the prompt, you run it — no placeholders left to fill in.',
  },
  {
    category: ArticleCategory.GUIDE,
    content: INSTAGRAM_GROWTH,
    coverImageUrl: articleArtwork(
      'how-to-grow-on-instagram-with-ai-generated-content',
    ),
    label: 'How to grow on Instagram with AI-generated content',
    publishedAt: '2026-07-30T09:00:00.000Z',
    slug: 'how-to-grow-on-instagram-with-ai-generated-content',
    summary:
      "Instagram's six ranking signals, which two you actually control, and a weekly publishing loop for accounts producing visuals with AI.",
  },
  {
    category: ArticleCategory.GUIDE,
    content: TIKTOK_GROWTH,
    coverImageUrl: articleArtwork(
      'how-to-grow-on-tiktok-with-ai-generated-content',
    ),
    label: 'How to grow on TikTok with AI-generated content',
    publishedAt: '2026-08-04T09:00:00.000Z',
    slug: 'how-to-grow-on-tiktok-with-ai-generated-content',
    summary:
      'Why completion rate dominates TikTok distribution, how to earn the For You page, and how generated video changes the economics of a volume platform.',
  },
  {
    category: ArticleCategory.GUIDE,
    content: LINKEDIN_GROWTH,
    coverImageUrl: articleArtwork(
      'how-to-grow-on-linkedin-with-ai-generated-content',
    ),
    label: 'How to grow on LinkedIn with AI-generated content',
    publishedAt: '2026-08-06T09:00:00.000Z',
    slug: 'how-to-grow-on-linkedin-with-ai-generated-content',
    summary:
      "Dwell time is LinkedIn's top ranking signal, and it explains every stylistic convention on the platform. What to post, when, and why.",
  },
  {
    category: ArticleCategory.GUIDE,
    content: YOUTUBE_GROWTH,
    coverImageUrl: articleArtwork(
      'how-to-grow-on-youtube-with-ai-generated-content',
    ),
    label: 'How to grow on YouTube with AI-generated content',
    publishedAt: '2026-08-11T09:00:00.000Z',
    slug: 'how-to-grow-on-youtube-with-ai-generated-content',
    summary:
      'YouTube is a search engine with a recommendation layer. Titles, thumbnails, retention, Shorts — and how to read CTR against view duration.',
  },
];

export { ORIGINAL_LAUNCH_BATCH_PUBLISHED_AT };
