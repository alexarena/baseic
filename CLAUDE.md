# CLAUDE.md

Project-specific guidance for Claude working in this repo. The README is the user-facing doc; this file captures what's non-obvious to an agent making changes.

## What this is

This repo is a **pnpm workspace monorepo** for the `@baseic/*` family of packages. Today it contains exactly one package, [`@baseic/sql`](packages/sql) — a SQLite **SQL generator** (not executor) that takes zod-defined tables and emits `CREATE TABLE` / `INSERT` strings. Intended use case: one-off report databases built from spreadsheet data.

Full SQLite coverage is a non-goal. Don't add support for window functions, CTEs, `SELECT`, joins, etc. to `@baseic/sql` — propose dropping a feature before adding scope.

When the user asks for new functionality, decide whether it belongs **inside `@baseic/sql`** or **as a new sibling package** (e.g. `@baseic/spreadsheet` for csv → SQL pipelines). Default to a new package when the new code has a meaningfully different surface area or dependency footprint.

## Architectural rules

These are load-bearing decisions; don't quietly reverse them.

- **Stateless `queryBuilder`.** No accumulator, no inserted-id tracking, no `.toSQL()` / `.reset()`. Each function is pure: input → SQL string. We previously had a stateful `QueryBuilder` class; the user explicitly removed it for simplicity. If you find yourself needing state to implement something, push back rather than adding it.
- **Foreign-key validation is delegated to SQLite.** `initializeDatabase` emits `PRAGMA foreign_keys = ON;` and `FOREIGN KEY (...) REFERENCES ...` clauses; that's the whole FK story at the `@baseic/sql` layer. Do not add runtime FK checks.
- **Zod is the source of truth for columns.** Anything that can be expressed as a `ZodTypeAny` should be. Things that can't (foreign keys today, maybe `unique`, `default`, `check` later) are wrapper functions that attach metadata to a zod schema (`__fk` is the existing precedent — non-enumerable, `Object.defineProperty`).
- **Type inference is a top priority.** `insertRow({ table: T, data })` must reject TypeScript-shape mismatches at compile time. When extending the API, preserve the `<T extends AnyTable>` + `RowForTable<T>` pattern. If a change weakens inference, it's wrong.
- **Every table has an `id` primary key.** It's a separate field on `table({...})`, not a member of `columns`. Don't try to generalize this — keeping `id` special is what makes inference clean.

## Code conventions

These follow the user's global preferences plus a few project specifics:

- **TypeScript everywhere.** Run with `node <file>.ts` directly — Node has native TS support. Don't introduce `tsx`, `ts-node`, or `swc` runners.
- **Watch mode** uses `node --watch`, e.g. `node --watch src/index.ts`. The build watcher is `tsdown --watch` via `pnpm dev`.
- **No constructor parameter properties.** Node's strip-only TS mode rejects `constructor(public readonly x: string)` — declare fields explicitly and assign in the body. Already burned us once.
- **Named functions over arrow functions.** Including in test callbacks (`it("...", function happyPath() { ... })`) — this matches existing tests.
- **Use modern syntax** (`const`, `async/await`, etc.).
- **No emojis** in code, comments, or docs unless the user explicitly asks.
- **Don't write new `.md` files** unless the user explicitly asks. README and this file were both requested.
- **Imports use explicit `.ts` extensions** (`import { ... } from "./table.ts"`) — matches `tsconfig.json` `allowImportingTsExtensions: true` and Node's resolver.
- **Package manager is pnpm.** Don't shell out to `npm` or `yarn`. The exception is the publish workflow, which calls `npm publish` because trusted publishing is implemented in npm CLI directly.

## Layout

```
.
├── packages/
│   └── sql/                        @baseic/sql
│       ├── src/
│       │   ├── index.ts            public exports
│       │   ├── table.ts            table()/columns()/foreignKey() + types (Table, RowForTable, ForeignKeyColumn, ...)
│       │   ├── sql.ts              zod->SQLite mapping, identifier quoting, literal escaping, CREATE/INSERT generators
│       │   └── queryBuilder.ts     stateless queryBuilder: initializeDatabase, insertRow, insertRows
│       ├── test/queryBuilder.test.ts   node:test suite
│       ├── examples/financials.ts  runnable port of the original spec
│       ├── tsconfig.json           strict, NodeNext, allowImportingTsExtensions, noEmit
│       ├── tsdown.config.ts        build config (ESM + d.ts, sourcemaps, clean)
│       ├── package.json            "@baseic/sql"
│       └── README.md               public-facing package docs
├── pnpm-workspace.yaml             packages: ["packages/*"]
├── package.json                    private workspace root, fan-out scripts only
├── README.md                       monorepo overview
├── CLAUDE.md                       (this file)
├── LICENSE                         MIT
└── .github/workflows/              ci.yml + publish.yml
```

When adding a new generator (e.g. for `CREATE INDEX`), put it in `packages/sql/src/sql.ts` and expose it via `packages/sql/src/queryBuilder.ts`. Keep `packages/sql/src/index.ts` purely re-exports.

## Commands

Root scripts fan out across the workspace via `pnpm -r`:

```sh
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # node --test in every package
pnpm build       # tsdown in every package
pnpm dev         # tsdown --watch in every package, in parallel
pnpm example     # runs packages/sql/examples/financials.ts
```

To run one package's scripts directly: `pnpm --filter @baseic/sql <script>`, or `cd packages/sql && pnpm <script>`.

After a non-trivial change, run `pnpm typecheck && pnpm test && pnpm example`. The example is intentionally easy to eyeball — diff its output against your expectations.

## Adding a new package

1. `mkdir -p packages/<name>/src` and create `packages/<name>/package.json` with name `@baseic/<name>`, `version` starting at `0.1.0`, `type: "module"`, the standard scripts (`build`, `dev`, `typecheck`, `test`), and `publishConfig: { "access": "public", "provenance": true }`.
2. Copy the `tsconfig.json` and `tsdown.config.ts` shape from `packages/sql`.
3. Add a `README.md` at the package root.
4. Run `pnpm install` from the workspace root to wire it into the lockfile.
5. **For publishing**, configure a separate trusted publisher entry on npmjs.com pointing at this repo's `publish.yml`, and add a publish step in `.github/workflows/publish.yml` for the new package.

## When the spec disagrees with the code

The original spec lives at `/Users/alex/Desktop/baseiq spec.ts` (note: filename typo, library is `baseic`). Two known divergences from that spec, both intentional:

1. **No runtime FK validation.** The spec's comment said `account_id: "checkin"` should error; we explicitly chose not to track inserted IDs. SQLite catches it.
2. **`z.date()` serializes as ISO-8601 TEXT.** The spec didn't specify; this seemed like the obvious default for spreadsheet imports.

Don't "fix" either of these without checking with the user.

## Things the user has already declined

- A stateful `QueryBuilder` class with `toSQL()` / `reset()` / FK tracking. Considered, removed.
- Per-instance vs singleton `queryBuilder`. The exported `queryBuilder` object is the canonical entry point.

## Testing notes

- Tests use `node --test` + `node:assert/strict`. Don't add `vitest`, `jest`, etc.
- Existing tests use named function callbacks (`function happyPath() { ... }`) — keep that style.
- Match SQL with `assert.match(sql, /.../)` for shape, `assert.equal` for exact strings. Existing tests use both.
