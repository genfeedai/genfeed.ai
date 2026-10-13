import { MARKETING_ASSETS } from '@data/marketing-assets.data';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';

// Both open agent integrations use the existing Genfeed creative-workspace illustration.
const OPEN_AGENT_ARTWORK = {
  alt: 'An open articulated precision silver gripper gently arranges an amber brief capsule and two campaign media frames on a dark workbench',
  src: cdnAsset('/assets/site/pages/openclaw.webp'),
};

export const PAGE_MARKETING_ASSETS = {
  '/about': MARKETING_ASSETS.creator,
  '/agent': MARKETING_ASSETS.integration,
  '/pricing': MARKETING_ASSETS.campaign,
  '/workflows': MARKETING_ASSETS.workflow,
  '/publishing': MARKETING_ASSETS.publishing,
  '/research': MARKETING_ASSETS.research,
  '/analytics': {
    alt: 'A precise smoked-glass magnifying lens suspended over a contact sheet of diverse campaign photographs, amber highlights isolate three winning frames',
    src: cdnAsset('/assets/site/pages/analytics.webp'),
  },
  '/benchmark': {
    alt: 'Three different optical lenses on identical graphite plinths examine the same coral sculpture under identical controlled illumination',
    src: cdnAsset('/assets/site/pages/benchmark.webp'),
  },
  '/brand-os': {
    alt: 'A photoreal art-director desk with curated coral and cobalt material swatches, one sculptural ceramic product, photographic prints and a neatly organized visual identity board, no writing',
    src: cdnAsset('/assets/site/pages/brand-os.webp'),
  },
  '/calendar': {
    alt: 'An elegant sculptural monthly grid built of shallow graphite compartments, several compartments hold miniature campaign photographs and one amber glass bead marks the next release',
    src: cdnAsset('/assets/site/pages/calendar.webp'),
  },
  '/cloud': {
    alt: 'Three floating brushed-silver worktables share a luminous amber glass creative object through thin physical connecting rails',
    src: cdnAsset('/assets/site/pages/cloud.webp'),
  },
  '/contact': {
    alt: 'Photoreal editorial still life of two sculptural graphite communication handsets facing one another across a warm oak desk, copper light bridges the small gap',
    src: cdnAsset('/assets/site/pages/contact.webp'),
  },
  '/desktop': {
    alt: 'A polished silver creative toolkit descending neatly into an open graphite desktop dock, amber lens and cobalt media slide inside',
    src: cdnAsset('/assets/site/pages/download.webp'),
  },
  '/experts': {
    alt: 'Photoreal adult subject-matter expert at a dark studio table arranging tactile visual references and a small microphone, warm authentic editorial portrait, no visible writing',
    src: cdnAsset('/assets/site/pages/experts.webp'),
  },
  '/faq': {
    alt: 'Two interlocking graphite question-and-answer containers open to reveal a clear amber lens',
    src: cdnAsset('/assets/site/pages/faq.webp'),
  },
  '/features': {
    alt: 'A curated collection of six distinct creative instruments on a graphite museum display: cinema lens, microphone, photograph frame, ceramic pen, media reel and optical prism',
    src: cdnAsset('/assets/site/pages/features.webp'),
  },
  '/hire-agents': {
    alt: 'Three distinct compact silver production stations coordinated around one amber creative brief, each station carries a camera lens, microphone or publishing tray',
    src: cdnAsset('/assets/site/pages/hire-agents.webp'),
  },
  '/integrations': {
    alt: 'A central polished-silver hub connects through slender physical rails to an elegant orbit of diverse photographic, video and editorial media frames',
    src: cdnAsset('/assets/site/pages/integrations.webp'),
  },
  '/library': {
    alt: 'Photoreal carefully organized archive of unmarked black archival sleeves, colorful photo contact sheets and film reels on dark shelves, warm directional lighting',
    src: cdnAsset('/assets/site/pages/library.webp'),
  },
  '/models': {
    alt: 'A curated museum cabinet of distinct optical glass lenses and sculptural metallic creative tools, each chamber has its own restrained lighting and material',
    src: cdnAsset('/assets/site/pages/models.webp'),
  },
  '/self-hosted': {
    alt: 'A sculptural dark server cabinet enclosing a glowing amber creative object behind clear smoked glass, keys physically held outside the cabinet',
    src: cdnAsset('/assets/site/pages/self-hosted.webp'),
  },
  '/skills': {
    alt: 'A neatly stacked modular set of graphite instruction tiles unlocks a silver camera lens, a microphone and a tiny photographic tray',
    src: cdnAsset('/assets/site/pages/skills.webp'),
  },
  '/studio': {
    alt: 'Photoreal refined creative studio set with an unmarked camera, a cinema light and coral still-life scene ready to shoot, deep black surroundings and warm light',
    src: cdnAsset('/assets/site/pages/studio.webp'),
  },
  '/turbo': {
    alt: 'Photoreal refined creative studio set with an unmarked camera, a cinema light and coral still-life scene ready to shoot, deep black surroundings and warm light',
    src: cdnAsset('/assets/site/pages/studio.webp'),
  },
  '/tools': {
    alt: 'A precision brushed-aluminum creative tool chest opened on a black workbench, camera lens, microphone and tactile media frames fitted into distinct compartments',
    src: cdnAsset('/assets/site/pages/tools.webp'),
  },
  '/tools/youtube-clips': {
    alt: 'A cinematic strip of unmarked film passes through a clean silver cutting gate and becomes three portrait-format photographic frames',
    src: cdnAsset('/assets/site/pages/tools-youtube-clips.webp'),
  },
  '/tools/youtube-long-form': {
    alt: 'Photoreal cinema camera and softly lit storytelling storyboard of unmarked photographic frames arranged in a wide horizontal arc on a dark studio desk',
    src: cdnAsset('/assets/site/pages/tools-youtube-long-form.webp'),
  },
  '/use-cases': {
    alt: 'Four richly varied editorial scenes displayed as large photographic prints on a black gallery wall: product, creator portrait, creative team and cinematic landscape',
    src: cdnAsset('/assets/site/pages/use-cases.webp'),
  },
  '/vs': {
    alt: 'A balanced brushed-metal measuring beam comparing two subtly different amber glass lenses on a dark background, fair comparison without a winner badge',
    src: cdnAsset('/assets/site/pages/vs.webp'),
  },
  '/developers': {
    alt: 'A modular open graphite development chassis with precise silver connections translating a small amber input capsule into a colorful campaign photographic frame, developer infrastructure',
    src: cdnAsset('/assets/site/pages/developers.webp'),
  },
  '/done-for-you': {
    alt: 'Photoreal creative production team of three diverse adults in a refined dark studio, arranging a complete campaign shoot around a coral ceramic product, natural candid collaboration',
    src: cdnAsset('/assets/site/pages/done-for-you.webp'),
  },
  '/founder-content': {
    alt: 'Photoreal fictional adult founder speaking thoughtfully into a small studio microphone beside tactile visual references on a dark wooden table, honest editorial portrait',
    src: cdnAsset('/assets/site/pages/founder-content.webp'),
  },
  '/podcast-to-content': {
    alt: 'An elegant graphite studio microphone at left sends a physical silver waveform ribbon into portrait photographic frames, editorial page and small audio reel at right',
    src: cdnAsset('/assets/site/pages/podcast-to-content.webp'),
  },
  '/launch-content': {
    alt: 'A sculptural amber product emerges from a dark presentation pedestal surrounded by coordinated campaign photographs and a softly lit cinematic frame',
    src: cdnAsset('/assets/site/pages/launch-content.webp'),
  },
  '/custom-models': {
    alt: 'A disciplined array of graphite inference modules each holding a distinctive optical lens, connected by precise silver rails around a single amber creative job',
    src: cdnAsset('/assets/site/pages/fleet.webp'),
  },
  '/linkedin': {
    alt: 'The LinkedIn logo as a glossy blue enamel badge on a graphite plinth, professional portrait frames and article cards fanning out on amber light threads',
    src: cdnAsset('/assets/site/pages/linkedin.webp'),
  },
  '/x': {
    alt: 'The X logo as a black obsidian-glass and brushed-silver sculpture on a graphite plinth, smoked-glass post cards fanning out on amber light threads',
    src: cdnAsset('/assets/site/pages/x.webp'),
  },
  '/instagram': {
    alt: 'The Instagram logo as a glossy gradient-glass sculpture on a graphite plinth, square and portrait campaign photographs fanning out on amber light threads',
    src: cdnAsset('/assets/site/pages/instagram.webp'),
  },
  '/tiktok': {
    alt: 'The TikTok logo as a glossy glass sculpture with cyan and red layered edges on a graphite plinth, vertical creator video frames fanning out on amber light threads',
    src: cdnAsset('/assets/site/pages/tiktok.webp'),
  },
  '/threads': {
    alt: 'The Threads logo as a black obsidian-glass and silver sculpture on a graphite plinth, stacked conversation cards fanning out on amber light threads',
    src: cdnAsset('/assets/site/pages/threads.webp'),
  },
  '/youtube': {
    alt: 'The YouTube logo as a glossy red enamel sculpture on a graphite plinth, cinematic widescreen and vertical video frames fanning out on amber light threads',
    src: cdnAsset('/assets/site/pages/youtube.webp'),
  },
  '/facebook': {
    alt: 'The Facebook logo as a glossy blue enamel disc on a graphite plinth, community photographs and post cards fanning out on amber light threads',
    src: cdnAsset('/assets/site/pages/facebook.webp'),
  },
  '/pinterest': {
    alt: 'The Pinterest logo as a glossy red enamel disc on a graphite plinth, portrait inspiration pins fanning out on amber light threads',
    src: cdnAsset('/assets/site/pages/pinterest.webp'),
  },
  '/mcp': {
    alt: 'A precise universal brushed-silver coupling connects several different camera, microphone and photographic output modules',
    src: cdnAsset('/assets/site/pages/mcp.webp'),
  },
  '/mobile': {
    alt: 'Photoreal unmarked graphite smartphone standing on a black plinth, its screen contains a single full-bleed coral campaign photograph, no interface text or icons',
    src: cdnAsset('/assets/site/pages/mobile.webp'),
  },
  '/docs': {
    alt: 'Photoreal beautifully bound unmarked dark technical reference book open to diagrams of metallic connectors and media frames, tactile paper and warm desk light, no lettering',
    src: cdnAsset('/assets/site/pages/docs.webp'),
  },
  '/extension': {
    alt: 'A small brushed-silver modular tool slides cleanly into a matching graphite browser-like frame holding a warm campaign photograph',
    src: cdnAsset('/assets/site/pages/extension.webp'),
  },
  '/use-cases/ai-influencers': {
    alt: 'Three matching ceramic portrait busts in coral, cobalt and amber glass frames connected by a silver identity lens',
    src: cdnAsset('/assets/site/pages/use-cases-ai-influencers.webp'),
  },
  '/use-cases/creators': {
    alt: 'Photoreal adult independent creator in a cobalt creative studio holding a compact silver camera, surrounded by film and photographic references, candid engaged energy',
    src: cdnAsset('/assets/site/pages/use-cases-creators.webp'),
  },
  '/use-cases/agencies': {
    alt: 'Photoreal diverse creative agency team of three adults reviewing large distinct campaign prints on a dark studio table, clear collaborative art direction',
    src: cdnAsset('/assets/site/pages/use-cases-agencies.webp'),
  },
  '/use-cases/ecommerce': {
    alt: 'Photoreal luxury unmarked skincare jar and sculptural running shoe displayed on separate coral plinths with coordinated campaign photographic prints, commercial content production',
    src: cdnAsset('/assets/site/pages/use-cases-ecommerce.webp'),
  },
  '/use-cases/marketers': {
    alt: 'Photoreal adult marketing art director arranging three versions of a coral product campaign on a dark worktable, visual comparison and purposeful iteration',
    src: cdnAsset('/assets/site/pages/use-cases-marketers.webp'),
  },
  '/use-cases/founders': {
    alt: 'Photoreal fictional adult startup founder in a warm minimalist workshop discussing an unmarked prototype with a small microphone and campaign prints nearby',
    src: cdnAsset('/assets/site/pages/use-cases-founders.webp'),
  },
  '/chatgpt': {
    alt: 'A single flowing graphite conversation ribbon curls around a brushed-silver connector hub',
    src: cdnAsset('/assets/site/pages/chatgpt.webp'),
  },
  '/claude': {
    alt: 'An open sculptural graphite writing folio routes through a warm copper connector into a fan of photographic campaign frames',
    src: cdnAsset('/assets/site/pages/claude.webp'),
  },
  '/claude-code': {
    alt: 'A precise open graphite terminal-shaped chassis fitted with a silver plug-in module, a curved amber rail routes into cinema lens and campaign photograph',
    src: cdnAsset('/assets/site/pages/claude-code.webp'),
  },
  '/claude-cowork': {
    alt: 'Two adjacent graphite workstations share one amber glass creative brief through a chrome connector, a shared media tray collects beautiful campaign imagery',
    src: cdnAsset('/assets/site/pages/claude-cowork.webp'),
  },
  '/codex': {
    alt: 'A modular silver tool cassette being fitted into an open graphite agent workstation, an amber creative capsule routes to a beautiful photographic output tray',
    src: cdnAsset('/assets/site/pages/codex.webp'),
  },
  '/cursor': {
    alt: 'A sculptural sharp silver pointer-shaped tool traces a precise path through a graphite editor-like frame and reveals a coral campaign image',
    src: cdnAsset('/assets/site/pages/cursor.webp'),
  },
  '/gemini': {
    alt: 'Two polished asymmetric optical lenses converge warm and cool beams onto a shared amber creative capsule, silver extension module connects them to photographic output',
    src: cdnAsset('/assets/site/pages/gemini.webp'),
  },
  '/openclaw': OPEN_AGENT_ARTWORK,
  '/hermes': OPEN_AGENT_ARTWORK,
  '/grok': {
    alt: 'An expressive angular smoked-glass conversational wave passes through a brushed-silver connector into sharply lit cinematic media frames',
    src: cdnAsset('/assets/site/pages/grok.webp'),
  },
  '/grok-bot': {
    alt: 'A compact graphite chat relay receives three tiny amber conversational beads and sends one photographic media frame through a silver bridge',
    src: cdnAsset('/assets/site/pages/grok-bot.webp'),
  },
  '/muse': {
    alt: 'A warm amber inspiration sculpture reflected in a large smoked-glass conversational panel, silver connection branches into vivid coral and cobalt creative output frames',
    src: cdnAsset('/assets/site/pages/muse.webp'),
  },
  '/integrations/youtube': {
    alt: 'A polished silver publishing coupling leading into cinema camera lens and unmarked wide film strip with a warm studio campaign still',
    src: cdnAsset('/assets/site/pages/integrations-youtube.webp'),
  },
  '/integrations/tiktok': {
    alt: 'A polished silver publishing coupling leading into three portrait-format motion frames showing a coral product shoot in progressive poses',
    src: cdnAsset('/assets/site/pages/integrations-tiktok.webp'),
  },
  '/integrations/instagram': {
    alt: 'A polished silver publishing coupling leading into a square coral fashion campaign print surrounded by warm editorial photo contact sheets',
    src: cdnAsset('/assets/site/pages/integrations-instagram.webp'),
  },
  '/integrations/linkedin': {
    alt: 'A polished silver publishing coupling leading into an editorial professional portrait and a crisp unmarked long-form article sheet',
    src: cdnAsset('/assets/site/pages/integrations-linkedin.webp'),
  },
  '/integrations/facebook': {
    alt: 'A polished silver publishing coupling leading into a warm photographic print of a diverse adult community collaborating at a table',
    src: cdnAsset('/assets/site/pages/integrations-facebook.webp'),
  },
  '/integrations/x-twitter': {
    alt: 'A polished silver publishing coupling leading into three concise sculptural conversational ribbons branching outward from an amber bead',
    src: cdnAsset('/assets/site/pages/integrations-x-twitter.webp'),
  },
  '/integrations/pinterest': {
    alt: 'A polished silver publishing coupling leading into a tactile unmarked inspiration board of interiors, fashion and coral product photographs',
    src: cdnAsset('/assets/site/pages/integrations-pinterest.webp'),
  },
  '/integrations/reddit': {
    alt: 'A polished silver publishing coupling leading into an open ring of graphite conversational blocks exchanging a single amber topic capsule',
    src: cdnAsset('/assets/site/pages/integrations-reddit.webp'),
  },
  '/integrations/discord': {
    alt: 'A polished silver publishing coupling leading into three connected graphite community spaces sharing cobalt photographic media through silver rails',
    src: cdnAsset('/assets/site/pages/integrations-discord.webp'),
  },
  '/integrations/twitch': {
    alt: 'A polished silver publishing coupling leading into a cinema camera with a small illuminated silver live transmission lens and amber media frame',
    src: cdnAsset('/assets/site/pages/integrations-twitch.webp'),
  },
  '/integrations/wordpress': {
    alt: 'A polished silver publishing coupling leading into an unmarked dark editorial book opening into an elegant wide photographic cover',
    src: cdnAsset('/assets/site/pages/integrations-wordpress.webp'),
  },
  '/integrations/snapchat': {
    alt: 'A polished silver publishing coupling leading into a transient amber portrait-format photographic frame passing through a curved silver lens',
    src: cdnAsset('/assets/site/pages/integrations-snapchat.webp'),
  },
  '/integrations/whatsapp': {
    alt: 'A polished silver publishing coupling leading into two rounded graphite messaging capsules linked by a physical warm amber conversation ribbon',
    src: cdnAsset('/assets/site/pages/integrations-whatsapp.webp'),
  },
  '/integrations/mastodon': {
    alt: 'A polished silver publishing coupling leading into three independent graphite community hubs joined by a refined chrome network with small amber messages',
    src: cdnAsset('/assets/site/pages/integrations-mastodon.webp'),
  },
  '/integrations/ghost': {
    alt: 'A polished silver publishing coupling leading into an unmarked minimalist editorial journal with a beautifully lit coral cover photograph and silver publishing tray',
    src: cdnAsset('/assets/site/pages/integrations-ghost.webp'),
  },
  '/integrations/shopify': {
    alt: 'A polished silver publishing coupling leading into a small refined storefront-like graphite display cabinet containing unmarked skincare jar and coral shopping packaging',
    src: cdnAsset('/assets/site/pages/integrations-shopify.webp'),
  },
  '/integrations/beehiiv': {
    alt: 'A polished silver publishing coupling leading into three beautifully arranged unmarked newsletter sheets with warm campaign photography, opening from a silver delivery slot',
    src: cdnAsset('/assets/site/pages/integrations-beehiiv.webp'),
  },
  '/integrations/medium': {
    alt: 'A polished silver publishing coupling leading into an unmarked long-form editorial sheet with beautiful typography-like abstract lines and a cinematic photographic header, no legible text',
    src: cdnAsset('/assets/site/pages/integrations-medium.webp'),
  },
  '/integrations/threads': {
    alt: 'A polished silver publishing coupling leading into fine interwoven chrome discussion threads wrapped around amber glass conversational beads',
    src: cdnAsset('/assets/site/pages/integrations-threads.webp'),
  },
  '/integrations/telegram': {
    alt: 'A polished silver publishing coupling leading into a folded silver messenger plane carries a small amber content capsule towards two graphite receivers',
    src: cdnAsset('/assets/site/pages/integrations-telegram.webp'),
  },
  '/integrations/slack': {
    alt: 'A polished silver publishing coupling leading into four graphite collaborative channels feed colored creative media frames into a central silver review tray',
    src: cdnAsset('/assets/site/pages/integrations-slack.webp'),
  },
  '/integrations/fanvue': {
    alt: 'A polished silver publishing coupling leading into a fictional adult fully clothed lifestyle creator in a warm high-end studio portrait displayed in a private graphite media cabinet',
    src: cdnAsset('/assets/site/pages/integrations-fanvue.webp'),
  },
  '/vs/*': {
    alt: 'Two contrasting precision optical systems examine the same richly textured coral campaign still-life, a clear central glass lens reveals shared details',
    src: cdnAsset('/assets/site/pages/comparison.webp'),
  },
} as const;

const pageAssets = new Map(Object.entries(PAGE_MARKETING_ASSETS));

export function getPageMarketingAsset(page: string) {
  return pageAssets.get(page) ?? MARKETING_ASSETS.integration;
}
