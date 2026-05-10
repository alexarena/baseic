import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { table, columns, foreignKey, queryBuilder } from "../src/index.ts";

const Accounts = table({
  name: "accounts",
  id: z.string(),
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
    account_id: foreignKey(Accounts, "id", z.string()),
  }),
});

describe("initializeDatabase", function describeInit() {
  it("emits CREATE TABLE with primary keys, columns, and foreign keys", function emitsSchema() {
    const sql = queryBuilder.initializeDatabase({
      name: "financials",
      tables: [Accounts, Transactions],
    });
    assert.match(sql, /PRAGMA foreign_keys = ON;/);
    assert.match(sql, /CREATE TABLE "accounts"/);
    assert.match(sql, /CREATE TABLE "transactions"/);
    assert.match(sql, /"id" TEXT PRIMARY KEY NOT NULL/);
    assert.match(sql, /"amount_cents" INTEGER NOT NULL/);
    assert.match(
      sql,
      /FOREIGN KEY \("account_id"\) REFERENCES "accounts"\("id"\)/,
    );
  });
});

describe("insertRow", function describeInsertRow() {
  it("validates with zod and emits INSERT", function happyPath() {
    const sql = queryBuilder.insertRow({
      table: Accounts,
      data: { id: "checking", label: "Checking" },
    });
    assert.equal(
      sql,
      `INSERT INTO "accounts" ("id", "label") VALUES ('checking', 'Checking');`,
    );
  });

  it("throws when zod validation fails (non-integer amount)", function rejectsNonInt() {
    assert.throws(
      function badInsert() {
        queryBuilder.insertRow({
          table: Transactions,
          data: {
            id: "tx-1",
            amount_cents: 100.25,
            date: new Date(),
            statement_description: "Initial deposit",
            account_id: "checking",
          },
        });
      },
      function isZodError(err: unknown) {
        return err instanceof z.ZodError;
      },
    );
  });

  it("does not validate foreign keys at runtime (left to SQLite)", function fkPassesThrough() {
    // No backend to look refs up in, so a dangling FK serializes fine here —
    // SQLite will reject it at execution time with PRAGMA foreign_keys = ON.
    const sql = queryBuilder.insertRow({
      table: Transactions,
      data: {
        id: "tx-1",
        amount_cents: 100,
        date: new Date("2026-05-01T00:00:00Z"),
        statement_description: "Initial deposit",
        account_id: "checkin",
      },
    });
    assert.match(sql, /'checkin'/);
  });
});

describe("insertRows", function describeInsertRows() {
  it("emits a single INSERT with multiple value tuples", function emitsBulk() {
    const sql = queryBuilder.insertRows({
      table: Accounts,
      rows: [
        { id: "checking", label: "Checking" },
        { id: "savings", label: "Savings" },
      ],
    });
    assert.match(sql, /INSERT INTO "accounts"/);
    assert.match(sql, /\('checking', 'Checking'\)/);
    assert.match(sql, /\('savings', 'Savings'\)/);
  });
});
