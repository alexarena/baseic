import { z } from "zod";
import { table, columns, foreignKey, queryBuilder } from "../src/index.ts";

const Accounts = table({
  name: "accounts",
  id: z.string(),
  columns: columns({
    label: z.string(),
  }),
});

const Tags = table({
  name: "tags",
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

const TagsToTransactions = table({
  name: "tags_to_transactions",
  id: z.string(),
  columns: columns({
    tag_id: foreignKey(Tags, "id", z.string()),
    transaction_id: foreignKey(Transactions, "id", z.string()),
  }),
});

console.log(
  queryBuilder.initializeDatabase({
    name: "financials",
    tables: [Accounts, Tags, Transactions, TagsToTransactions],
  }),
);

console.log(
  queryBuilder.insertRows({
    table: Accounts,
    rows: [
      { id: "checking", label: "Checking" },
      { id: "savings", label: "Savings" },
    ],
  }),
);

console.log(
  queryBuilder.insertRow({
    table: Transactions,
    data: {
      id: "tx-1",
      amount_cents: 10025,
      date: new Date("2026-05-01T00:00:00Z"),
      statement_description: "Initial deposit",
      account_id: "checking",
    },
  }),
);
