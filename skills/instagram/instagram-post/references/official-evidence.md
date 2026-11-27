# Instagram Official Evidence

Use this file when the user asks whether an Instagram caption, hashtag or media rule is real or source-backed. The Instagram skills (`instagram-post`, `instagram-reel`, `instagram-carousel`, `instagram-warmup`) and the content skills state the same hashtag rule from here.

Never present an inferred heuristic as an Instagram rule.

## Source Hierarchy

1. Instagram's own pages (Creators, About Instagram, official accounts)
2. Meta's Instagram Platform developer reference (what the API accepts)
3. The account's own Insights
4. Heuristics inferred from the above

## Verified Rules

All pages read on 2026-11-24.

| Rule | What the source says | Source |
|------|----------------------|--------|
| At most 5 hashtags in a post or reel | "New hashtag guidance: Starting today, Instagram will allow up to 5 hashtags in a reel or post." Posted 2025-12-18. | https://www.threads.com/@creators/post/DSalXGPCWM4 |
| Hashtags must be relevant | "Don't try to game the system by showing irrelevant hashtags, because engagement and consequently distribution may suffer if your content is shown to audiences who aren't interested in your content." | https://creators.instagram.com/faq |
| Trending hashtags help only when relevant | "Trending hashtags that are relevant to the topics in your reel can help you reach more people, who are interested in those topics specifically." | https://creators.instagram.com/faq |
| Keywords and hashtags go in the caption, not the comments | "For a post to be found in Search, put keywords and hashtags in the caption, not the comments." Article dated 2021-08-25; nothing newer found. | https://about.instagram.com/blog/announcements/break-down-how-instagram-search-works |
| Search matches more than hashtags | "We try to match what you type with relevant usernames, bios, captions, hashtags and places." | https://about.instagram.com/blog/announcements/break-down-how-instagram-search-works |
| Engagement bait is not recommended | Listed under non-recommendable content: "clickbait, engagement bait, or which promotes a contest or giveaway". | https://creators.instagram.com/faq |
| Third-party watermarks can cost reach | "Ditch the watermark! The 3rd party watermark on your reel may be impacting its reach." | https://creators.instagram.com/faq |
| Caption limit through the API | "Maximum 2200 characters, 30 hashtags, and 20 @ tags." (v27.0) | https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media |
| Alt text | `alt_text`: "Alternative text, up to 1000 character, for an image. Only supported on a single image or image media in a carousel." Not supported on Reels or Stories. | same reference |
| AI disclosure | `is_ai_generated`: "An optional parameter to provide a self-disclosure of AI usage in the post. Not available for carousel children." | same reference |
| Carousel size through the API | "Carousels can have up to 20 total images, videos, or a mix of the two." Genfeed publishes 2 to 10 images; `check_channel` returns the number Genfeed enforces. | same reference |
| Image format through the API | "Format: JPEG", 8 MB maximum. | same reference |

## Unverified

Do not state these as Instagram rules. Offer them as untested heuristics, or leave them out.

| Claim | Why it is unverified |
|-------|----------------------|
| More than 5 hashtags "blocks publication" | Instagram's post says it will allow up to 5. What the app or the API does with a sixth was not found on any official page. Meta's developer reference still says 30. Genfeed warns past 5 and does not block. |
| Hashtag tiers by post volume (1M+, 10K-500K, under 10K) | Instagram's FAQ only says relevant hashtags can help. The tiers are creator folklore. |
| Hashtags in the first comment | The search article says to put them in the caption (2021). Nothing newer found. |
| "Only the first ~125 characters show before ...more" | No Meta page states the number. Use it as a working target for the first line, not as a limit. |
| Saves and shares as the strongest signals | Instagram does not publish weights. Check the account's Insights. |
| Help Center claims | `help.instagram.com` renders as an empty shell to automated readers, so nothing from it was checked. |

## What To Write

- 3 to 5 hashtags, never more than 5, in the caption.
- Each hashtag names something that is in the post. No block of generic tags.
- Keywords in the caption for search; alt text up to 1,000 characters on single images.
- Set the AI-generated disclosure when the post is made with AI.
- No engagement bait, no third-party watermarks.
