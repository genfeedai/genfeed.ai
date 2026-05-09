# Official Evidence Map

Use this file when the user asks whether the X warmup or hardening rules are real, official, or source-backed.

## Source Hierarchy

1. Official X policy/help/business documentation
2. Official `twitter/the-algorithm` open-source repository
3. User-owned account analytics or observed performance data
4. Heuristics inferred from the above

Never present an inferred heuristic as an official X rule.

## Official X Documentation

| Claim | What the source supports | Source |
|-------|--------------------------|--------|
| Recommendations use many signals, not one fixed weight | X says recommendations use choices and behaviors including follows, topics, likes, reposts, shares, replies, watched media, and network popularity; no single signal has a static greater weight. | https://help.x.com/en/rules-and-policies/recommendations |
| Harmful/spammy accounts can be ineligible for recommendations | X says accounts that recently violated rules or are thought to be spammy may be kept out of recommendations. | https://help.x.com/en/rules-and-policies/recommendations |
| Bulk, duplicative, irrelevant, unsolicited posting is risky | X authenticity policy prohibits bulk/high-volume unsolicited replies, excessive unrelated hashtags, links without commentary, irrelevant promotional replies, repeated deletion/reposting, and copypasta. | https://help.x.com/en/rules-and-policies/authenticity |
| Artificial engagement is prohibited | X prohibits engagement exchange, metric inflation, follow churn, indiscriminate following, aggressive automated engagement, duplicating followers, and third-party services that do those things. | https://help.x.com/en/rules-and-policies/authenticity |
| Reach can be restricted | X lists reach restriction as an enforcement option, including exclusion from search, trends, recommended notifications, For You, Following, discoverability, and reply downranking. | https://help.x.com/en/rules-and-policies/authenticity |
| Account/action limits exist and aggressive following has extra rules | X publishes technical limits and says daily follow limits are technical only, with additional rules prohibiting aggressive following. | https://help.x.com/en/rules-and-policies/x-limits |
| Third-party follower apps are risky | X following FAQ says apps promising many followers usually violate Terms and may lead to suspension; it recommends engaging, following meaningful accounts, and reading/posting high-quality information. | https://help.x.com/en/using-x/following-faqs |
| Automated replies need consent/context and may need approval | X automation rules prohibit unsolicited automated mentions/replies, keyword-search auto-replies, spammy/duplicative automation, automated likes, and aggressive automated following/unfollowing. | https://help.x.com/en/rules-and-policies/x-automation |
| Organic posts should be concise and conversational | X Business organic best practices recommend concise copy, conversational tone, avoiding all-caps, and avoiding hashtags in post copy. | https://business.x.com/en/basics/organic-best-practices |
| Replies and conversation are core to community building | X Business community management says conversation thrives on X, replies create one-to-one conversations, and strong replies can yield engagement and follows. | https://business.x.com/en/basics/community-management |
| Social listening is an official tactic | X Business recommends advanced search, Lists, Postdeck, and trend monitoring to find conversations to join. | https://business.x.com/en/basics/community-management |

## Open-Source Algorithm Evidence

| Claim | What the code supports | Source |
|-------|------------------------|--------|
| `tweepcred` is a real reputation component | The repo describes `tweepcred` as a PageRank algorithm for user reputation. | https://github.com/twitter/the-algorithm/blob/c54bec0d4e029fe34926ef3258a86ccacc0d0182/README.md |
| Candidate sourcing uses behavior signals | The repo lists follows, unfollows, mutes, blocks, likes, unlikes, reposts, quote posts, replies, shares, bookmarks, clicks, video watches, "not interested", reports, notifications, and address book signals. | https://github.com/twitter/the-algorithm/blob/c54bec0d4e029fe34926ef3258a86ccacc0d0182/RETREIVAL_SIGNALS.md |
| Account age and follower/following ratio affect reputation mass | `UserMass` uses account age, device presence, safety status, verified status, follower count, following count, and follower/following ratio. | https://github.com/twitter/the-algorithm/blob/c54bec0d4e029fe34926ef3258a86ccacc0d0182/src/scala/com/twitter/graph/batch/job/tweepcred/UserMass.scala |
| High following count with weak follower ratio can reduce reputation | `Reputation.adjustReputationsPostCalculation` reduces mass for users with many followings and low follower ratio. | https://github.com/twitter/the-algorithm/blob/c54bec0d4e029fe34926ef3258a86ccacc0d0182/src/scala/com/twitter/graph/batch/job/tweepcred/Reputation.scala |
| Low-reputation accounts plus certain links can be treated as spam vector | `SpamVectorScoringFunction` treats non-media, non-news links as a spam vector when tweepcred is below a threshold, unless engagement exists. | https://github.com/twitter/the-algorithm/blob/c54bec0d4e029fe34926ef3258a86ccacc0d0182/src/java/com/twitter/search/earlybird/search/relevance/scoring/SpamVectorScoringFunction.java |
| Author quality/newness/profile/spam signals exist | `RecapFeatures` includes features such as author profile default image, author newness, author NSFW, author spam, mention count, and hashtag count. | https://github.com/twitter/the-algorithm/blob/c54bec0d4e029fe34926ef3258a86ccacc0d0182/src/scala/com/twitter/timelines/prediction/features/recap/RecapFeatures.scala |
| Out-of-network recommendations use recent engagement graph traversal | UTEG generates out-of-network "liked" tweets from weighted follow graph traversal and recent user engagements over roughly 24-48 hours. | https://github.com/twitter/the-algorithm/blob/c54bec0d4e029fe34926ef3258a86ccacc0d0182/src/scala/com/twitter/recos/user_tweet_entity_graph/README.md |

## Derived Hardening Rules

| Rule | Classification | Why |
|------|----------------|-----|
| Keep copy concise and conversational | Official X guidance | Directly supported by X Business organic best practices. |
| Avoid hashtag stuffing | Official X guidance and policy | Supported by organic best practices and authenticity policy. |
| Use contextual replies | Official X guidance and policy | Supported by community management guidance and policy against irrelevant promotional replies. |
| Add a concrete reason to reply/share/bookmark/click | Algorithm-aware heuristic | Behavior signals are documented, but exact weights are not public. |
| Avoid early link-heavy content | Algorithm-aware heuristic | Search spam code and X policy both support link caution; exact production handling may differ. |
| Avoid mass-follow/follow-churn | Official policy and algorithm-aware | Supported by X authenticity policy, X limits/following docs, and reputation code. |
| Score content for specificity, evidence, consequence, conversation pull, and compliance | Internal heuristic | Built from official X copy guidance, recommendation signals, and policy constraints. |
