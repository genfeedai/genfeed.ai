# Genfeed Trademark Policy

**Effective:** 2026-08-17

The Genfeed source code is licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE). That licence grants
rights to the **code**.
They do not grant rights to the **Genfeed name, logo, or other brand assets**.
This policy explains what you can and cannot do with the Genfeed marks.

The goal is simple: people who see the Genfeed name should be able to trust
that they are getting Genfeed — the code, the hosted product, or something the
Genfeed maintainers stand behind — and not a modified or unaffiliated version
presented as official.

## 1. The marks

The following are trademarks of Genfeed (the "Marks"), whether or not
registered:

- the word marks **Genfeed** and **Genfeed.ai**;
- the Genfeed logo and icon in any form or colour;
- the domain names `genfeed.ai`, `app.genfeed.ai`, `docs.genfeed.ai`,
  `api.genfeed.ai`, and `mcp.genfeed.ai`;
- any confusingly similar name, logo, or stylisation.

Product-surface names used inside the software (for example "Community",
"Desktop", or the names of packages such as `@genfeedai/cli`) are covered to the
extent they are combined with a Mark.

## 2. What you may do without asking

You may use the word marks, in plain text and without altering them, to:

- **Refer to the project truthfully.** "Built with Genfeed", "a plugin for
  Genfeed", "compatible with the Genfeed API", "my fork of Genfeed", or "based on
  Genfeed" are all fine, provided the statement is accurate and it is clear that
  your product or service is not the official one.
- **Self-host an unmodified Community release** for yourself, your company, or
  your clients, and tell people that it is Genfeed. Running the official
  bundle is using Genfeed, not creating a derivative.
- **Link to us.** Use the word marks in links to `genfeed.ai`, this repository,
  or the documentation.
- **Write about us.** Blog posts, tutorials, videos, talks, reviews, comparisons,
  news, and academic work may use the word marks and reproduce the logo to
  identify the project.
- **Distribute unmodified official artifacts.** Mirroring the release bundle,
  container image, or published packages with their checksums intact, and
  calling them Genfeed, is permitted.
- **Use the `@genfeedai/*` package names and the repository name in commands
  and code** exactly as published — that is what they are for.

You may use the logo, unaltered, to identify the project in the contexts above
(for example a "Works with Genfeed" badge, a slide, or an integrations page).
Do not alter the colours or proportions, combine it with your own mark, or make
it the most prominent element of your own branding.

## 3. What requires written permission

You need explicit written permission from the maintainer before you:

- **Use a Mark in the name of your product, service, company, domain, app-store
  listing, social-media handle, or hosted offering** — for example
  "Genfeed Cloud", "GenfeedHost", "genfeed-pro.com", or `@genfeed_something`.
  Descriptive phrases that make the relationship clear ("Acme's managed hosting
  for Genfeed") do not need permission; names that lead with the Mark do.
- **Offer a hosted or managed version of Genfeed to third parties under a
  Genfeed Mark**, or in a way that suggests it is operated, endorsed, or
  supported by Genfeed. You may run a hosted service from the AGPL code — the
  licence allows it — but it must carry your own name and comply with the AGPL
  (including making the corresponding source available to your users).
- **Ship a modified version under the Genfeed name.** If you change the code
  beyond configuration, theming that keeps our attribution, or packaging for a
  platform, the result must be renamed so it is not confused with the official
  release. Keep our copyright and licence notices; remove or replace our logo
  and name in the user interface.
- **Use the logo in a modified form**, in a composite mark, or as the primary
  branding of a product or service.
- **Sell merchandise** or other physical goods bearing a Mark.
- **Register or use a domain, company name, or trademark** that includes or is
  confusingly similar to a Mark.

Requests: email [support@genfeed.ai](mailto:support@genfeed.ai) with
`[TRADEMARK]` in the subject line and describe the intended use. We aim to
answer within 14 days. Permission, when granted, is non-exclusive, revocable, and
limited to the described use.

## 4. Things that are never allowed

- Implying that your product or service is official, endorsed by, affiliated
  with, or supported by Genfeed when it is not.
- Using a Mark in a way that is misleading, disparaging, or that damages the
  reputation of the project or its maintainers.
- Using a Mark for anything unlawful, or in connection with material that
  violates the [Code of Conduct](CODE_OF_CONDUCT.md).
- Removing our attribution from the software or documentation while continuing
  to present it as Genfeed.

## 5. Forks and derivatives — a practical guide

If you fork this repository on GitHub, keep the fork's repository name — that
is expected and clearly attributed by GitHub itself. Once you **publish builds,
images, or a hosted service** from a fork with meaningful code changes:

1. Give it a distinct name that does not include a Mark (for example
   "Acme Feed (based on Genfeed)").
2. Replace the logo, favicon, product name, and email templates in the UI.
3. Keep every copyright notice, the AGPL notice, and a visible statement that
   the software is derived from Genfeed, with a link back to this repository.
4. Comply with the AGPL: users of your network service must be able to obtain
   your modified source.
5. Do not use `genfeed.ai` domains, `@genfeedai` handles, or the official
   container registry / package names for your artifacts.

Nothing in this policy restricts the rights granted by the AGPL. Where this
policy and the licence appear to conflict, the licence governs the code and
this policy governs the Marks.

## 6. Reporting misuse

If you believe a Mark is being misused, email
[support@genfeed.ai](mailto:support@genfeed.ai) with `[TRADEMARK]` in the
subject. Please include the URL and a short description.

## 7. Changes to this policy

This policy may be revised over time. The version in the `master` branch of
this repository is the current one; the effective date at the top changes with
each revision. Uses that were permitted under a previous version remain
permitted for a reasonable transition period after a change.

## Attribution

This policy is informed by the trademark guidelines of the Model Trademark
Guidelines project ([modeltrademarkguidelines.org](https://modeltrademarkguidelines.org))
and by common practice among open-core projects. It is not legal advice.
