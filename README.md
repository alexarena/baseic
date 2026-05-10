# baseic

A tiny, type-safe SQLite query builder for throwaway report databases.

`baseic` doesn't execute SQL — it just generates it. The intended use case is taking data from a spreadsheet (or some other tabular source), defining a small set of tables with [zod](https://zod.dev) schemas, and emitting the `CREATE TABLE` + `INSERT` statements you'd run against a fresh SQLite database to produce a one-off report.

Full SQLite compatibility is a non-goal. If you find yourself wanting window functions or recursive CTEs, you've outgrown this library.

## Design

- **Zod schemas are the primary column definition.** A column is just a `ZodTypeAny`; baseic maps it to a SQLite affinity at generation time.
- **Things that don't fit in zod are wrapped functions** — e.g. `foreignKey(Accounts, "id", z.string())` returns a zod schema with foreign-key metadata attached.
- **Strong type inference is a top priority.** `insertRow({ table: Transactions, data: ... })` rejects rows whose shape doesn't match the table at the TypeScript level.
- **Stateless by design.** `queryBuilder.*` functions are pure: input goes in, SQL string comes out. No accumulator, no FK runtime tracking, nothing to reset.

## Install

```sh
pnpm add baseic zod
```

`zod` is a peer-ish dependency — bring your own.

## Quick start

```ts
import { z } from "zod";
import { table, columns, foreignKey, queryBuilder } from "baseic";

const Accounts = table({
  name: "accounts",
  id: z.string(), // primary key
  columns: columns({
    label: z.string(),
  }),
});

const Transactions = table({
  name: "transactions",
  id: z.string(),
  columns: columns({
    amount_cents: z.number().int(),
    date: z.date(),
    statement_description: z.string(),
    // non-null foreign key to Accounts.id
    account_id: foreignKey(Accounts, "id", z.string()),
  }),
});

// Generate CREATE TABLE statements (and PRAGMA foreign_keys = ON).
const schemaSQL = queryBuilder.initializeDatabase({
  name: "financials",
  tables: [Accounts, Transactions],
});

// Generate a single-row INSERT (validates with zod first).
const accountSQL = queryBuilder.insertRow({
  table: Accounts,
  data: { id: "checking", label: "Checking" },
});

// Generate a multi-row INSERT.
const accountsSQL = queryBuilder.insertRows({
  table: Accounts,
  rows: [
    { id: "checking", label: "Checking" },
    { id: "savings", label: "Savings" },
  ],
});
```

Concatenate the strings, run them against SQLite, you have a report database.

## API

### `table({ name, id, columns })`

Defines a table.

| field     | type                                | meaning                                |
| --------- | ----------------------------------- | -------------------------------------- |
| `name`    | `string`                            | SQL table name (used verbatim)         |
| `id`      | `ZodTypeAny`                        | primary-key schema (always called `id`) |
| `columns` | `Record<string, ZodTypeAny>`        | non-id columns                         |

Every table has an `id` column that is `PRIMARY KEY NOT NULL`. Other columns default to `NOT NULL`; wrap them in `.optional()` or `.nullable()` to allow NULL.

### `columns({ ... })`

Identity helper. Exists so the table-definition site reads naturally:

```ts
columns: columns({
  label: z.string(),
})
```

You can pass a plain object instead — `columns` just preserves type inference.

### `foreignKey(targetTable, targetColumn, schema)`

Wraps a zod schema with foreign-key metadata. The second argument is type-narrowed to the columns of the target table, so `foreignKey(Accounts, "labl", …)` is a TypeScript error.

```ts
account_id: foreignKey(Accounts, "id", z.string())
```

The metadata becomes a `FOREIGN KEY (...) REFERENCES ...` clause in the generated `CREATE TABLE` SQL.

### `queryBuilder.initializeDatabase({ name, tables })`

Returns a string containing:

- a comment banner with the database name,
- `PRAGMA foreign_keys = ON;`,
- a `CREATE TABLE` for each table (with primary key and foreign-key constraints).

### `queryBuilder.insertRow({ table, data })`

Validates `data` with the table's zod schema (raising a `ZodError` on failure), then returns a single `INSERT INTO ... VALUES (...);` statement.

The `data` parameter is type-checked at the TS level, so column-name typos and shape mismatches surface in your editor:

```ts
queryBuilder.insertRow({
  table: Transactions,
  data: {
    id: "tx-1",
    amount_cents: 100.25, // zod runtime error: not an integer
    date: new Date(),
    description: "Initial deposit", // TS error: should be statement_description
    account_id: "checkin", // valid string, but SQLite will reject the FK
  },
});
```

### `queryBuilder.insertRows({ table, rows })`

Like `insertRow`, but emits a single `INSERT` with multiple `VALUES (...)` tuples.

## Validation: where errors surface

There are three levels of validation, and baseic only owns the first two:

1. **TypeScript** — wrong column names, missing fields, wrong value types.
2. **Zod** (at insert time) — `z.number().int()` rejects `100.25`, `z.email()` rejects `"not-an-email"`, etc.
3. **SQLite** (at execution time) — foreign-key violations, primary-key conflicts, anything else the engine catches.

baseic deliberately doesn't track inserted rows or validate foreign keys at runtime; that simplification keeps the library stateless. Run the SQL with `PRAGMA foreign_keys = ON` (which `initializeDatabase` emits for you) and SQLite handles it.

## Type → SQLite mapping

| zod                 | SQLite affinity       |
| ------------------- | --------------------- |
| `z.string()`        | `TEXT`                |
| `z.number()`        | `REAL`                |
| `z.number().int()`  | `INTEGER`             |
| `z.bigint()`        | `INTEGER`             |
| `z.boolean()`       | `INTEGER` (`0` / `1`) |
| `z.date()`          | `TEXT` (ISO-8601)     |
| `.optional()` / `.nullable()` | recurses; column becomes nullable |

`z.date()` columns serialize as ISO-8601 strings (e.g. `'2026-05-01T00:00:00.000Z'`). SQLite has no native date type; treat dates as TEXT and parse them on read.

## Examples

A full example matching the spec lives at [examples/financials.ts](examples/financials.ts):

```sh
pnpm example
```

## Build

`baseic` builds with [tsdown](https://tsdown.dev):

```sh
pnpm build      # one-off
pnpm dev        # watch mode
pnpm typecheck  # tsc --noEmit
pnpm test       # node --test
```

## What baseic is not

- Not a SQL executor. Pipe the output to `sqlite3`, `better-sqlite3`, or whatever runs queries.
- Not a migration tool. Tables are created from scratch; throw the database away when you're done.
- Not an ORM. There's no query language, no `select`, no relationships beyond `FOREIGN KEY` clauses.
- Not a full SQLite wrapper. The type mapping covers the cases that show up in spreadsheet imports; everything else is your problem.
