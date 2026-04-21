# Scope Validator

Determine whether a feature belongs in Genfeed OSS Core or Cloud SaaS.

## Installation

```bash
npx skills add genfeedai/skills/scope-validator
```

## Usage

Ask about feature scope:

```
Should social publishing be in core or cloud?
```

```
Can I contribute an RSS input node to core?
```

```
Is FAL.ai provider support in scope for OSS?
```

## What It Does

This skill helps users and contributors understand the boundary between:

- **OSS Core** - Open source, self-hosted, Replicate-only
- **Cloud SaaS** - Commercial features, managed service, multi-provider

## Decision Guide

| Feature Type | Location | Action |
|--------------|----------|--------|
| New processing node | Core | Submit PR to [genfeedai/core](https://github.com/genfeedai/core) |
| New AI model (Replicate) | Core | Submit PR |
| Social publishing | Cloud | Subscribe at [genfeed.ai](https://genfeed.ai) |
| Feed aggregation (RSS/Twitter) | Cloud | Subscribe |
| FAL.ai / HuggingFace models | Cloud | Subscribe |

## OSS Core Includes

- 26 node types (input, AI generation, processing, output)
- Replicate provider
- Visual workflow editor
- Queue-based execution
- Self-hosted deployment

## Cloud-Only Features

- Social publishing (7 platforms)
- RSS/Twitter feed input
- Tweet remix
- FAL.ai provider
- HuggingFace provider
- Managed hosting

## License

MIT
