# scripts/migrations/

This directory no longer holds hand-run production scripts.

One-time tenant or product data changes are Prisma data migrations.
Code-owned catalogs (models, rates, skills, Studio presets, studio elements)
are reconciled by the reference-data sync. Local QA data is the fixture seed.

See `.agents/memory/context/data-change-protocol.md`.
