import {
  type AnyTable,
  type RowForTable,
} from "./table.ts";
import {
  commentBanner,
  createTableSQL,
  insertRowSQL,
  insertRowsSQL,
  pragmaForeignKeysOn,
  rowSchemaFor,
} from "./sql.ts";

export interface InitializeDatabaseInput {
  name: string;
  tables: AnyTable[];
}

export interface InsertRowInput<T extends AnyTable> {
  table: T;
  data: RowForTable<T>;
}

export interface InsertRowsInput<T extends AnyTable> {
  table: T;
  rows: RowForTable<T>[];
}

/**
 * Generate `CREATE TABLE` statements for every table in the database.
 *
 * The output also turns on `PRAGMA foreign_keys` so SQLite enforces the
 * declared foreign keys when the SQL is later executed against a real db.
 */
export function initializeDatabase(input: InitializeDatabaseInput): string {
  const parts: string[] = [
    commentBanner(`database: ${input.name}`),
    pragmaForeignKeysOn(),
    "",
  ];
  for (const t of input.tables) {
    parts.push(commentBanner(`table: ${t.name}`));
    parts.push(createTableSQL(t));
    parts.push("");
  }
  return parts.join("\n").trim() + "\n";
}

/**
 * Validate a row with the table's zod schema and emit an `INSERT` statement.
 *
 * Foreign-key references are *not* validated at this layer — we have no SQL
 * backend to look them up in. Catch those when the SQL runs against SQLite
 * (with `PRAGMA foreign_keys = ON`).
 */
export function insertRow<T extends AnyTable>(input: InsertRowInput<T>): string {
  const validated = rowSchemaFor(input.table).parse(input.data) as RowForTable<T>;
  return insertRowSQL(input.table, validated as Record<string, unknown>);
}

export function insertRows<T extends AnyTable>(input: InsertRowsInput<T>): string {
  const schema = rowSchemaFor(input.table);
  const validated = input.rows.map((r) => schema.parse(r) as RowForTable<T>);
  return insertRowsSQL(
    input.table,
    validated as unknown as Record<string, unknown>[],
  );
}

/**
 * Spec-shaped namespace: `queryBuilder.initializeDatabase(...)` etc.
 * It's just a thin object grouping the pure functions above.
 */
export const queryBuilder = {
  initializeDatabase,
  insertRow,
  insertRows,
} as const;
