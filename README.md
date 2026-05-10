# baseic

Monorepo for the `@baseic/*` packages — small, type-safe utilities for building throwaway SQLite report databases out of tabular data.

## Packages

| Package | Description |
| --- | --- |
| [`@baseic/sql`](packages/sql) | Zod-driven SQLite query builder. Generates `CREATE TABLE` and `INSERT` SQL from typed table definitions. |

More to come.

## Working in the repo

```sh
pnpm install      # install workspace deps
pnpm typecheck    # tsc --noEmit, all packages
pnpm test         # node --test, all packages
pnpm build        # tsdown, all packages
pnpm dev          # watch builds in parallel across packages
pnpm example      # run packages/sql/examples/financials.ts
```

Workspace layout:

```
.
├── packages/
│   └── sql/          → @baseic/sql
├── pnpm-workspace.yaml
└── package.json      (private workspace root)
```

## Releasing

CI runs on every push to `main` and on PRs.

Publishing happens via tag push:

```sh
# from the relevant package directory
cd packages/sql
pnpm version patch   # bumps and tags as v0.1.1
git push --follow-tags
```

A tag matching `v*.*.*` triggers `.github/workflows/publish.yml`, which authenticates to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers) (no long-lived `NPM_TOKEN`). Each `@baseic/*` package needs its own trusted-publisher configuration on npmjs.com pointing at this repo's `publish.yml`.

## License

[MIT](LICENSE).
