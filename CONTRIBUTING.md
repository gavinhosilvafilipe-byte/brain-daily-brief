# Contributing

Solo project, but here's how I keep it sane.

## Branch rules
- `main` is always deployable
- Feature branches: `feat/short-name`
- Fixes: `fix/short-name`

## Commits
Conventional commits (Karpathy/caveman style):
```
feat: add B3 OHLCV ingest source
fix: clamp Sonnet retries to 3
docs: update cost model with May actuals
chore: bump deps
```

## Before pushing
```bash
npm run lint     # ESLint
npm test         # Unit tests
npm run brief -- --dry  # Verify brief renders without sending
```

## Cost discipline
- New job touching Sonnet → add cost estimate in PR description
- New ingest source → log token count, must fit Haiku context
- PR that bumps monthly est > $20 → discuss first

## Adding a data source
1. Append source to `src/jobs/ingest.js`:
   ```js
   { name: 'source-name', fetch: async () => '/* return string */' }
   ```
2. Add column to `packs` table via new Supabase migration
3. Update README cost table if it's >$1/mo

## Adding a model call
- Use Haiku unless reasoning > 30% complexity → see CLAUDE.md routing rules
- Sonnet only for synthesis, deep dives, briefs
- Never Opus without explicit approval

## Secrets
Never commit `.env`. Use GitHub Actions secrets for CI.
