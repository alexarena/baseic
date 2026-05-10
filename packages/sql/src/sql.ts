import { z } from "zod";
import {
  type AnyTable,
  type Table,
  getForeignKey,
} from "./table.ts";

/** SQLite affinity inferred from a zod schema. */
export type SqliteType = "INTEGER" | "REAL" | "TEXT" | "BLOB" | "NUMERIC";

/**
 * Map a zod schema to a SQLite column type.
 *
 * Kept deliberately small — full zod coverage is out of scope. We only need
 * what shows up in throwaway report databases.
 */
export function sqliteTypeFor(schema: z.ZodTypeAny): SqliteType {
  const def = (schema as { _def?: { typeName?: string } })._def;
  switch (def?.typeName) {
    case "ZodString":
      return "TEXT";
    case "ZodNumber": {
      // ZodNumber with `.int()` becomes INTEGER, otherwise REAL.
      const checks = (schema as { _def: { checks?: { kind: string }[] } })._def
        .checks;
      const isInt = checks?.some((c) => c.kind === "int");
      return isInt ? "INTEGER" : "REAL";
    }
    case "ZodBoolean":
      return "INTEGER";
    case "ZodDate":
      return "TEXT"; // ISO-8601 string at insert time
    case "ZodBigInt":
      return "INTEGER";
    case "ZodNullable":
    case "ZodOptional": {
      const inner = (schema as { _def: { innerType: z.ZodTypeAny } })._def
        .innerType;
      return sqliteTypeFor(inner);
    }
    default:
      return "TEXT";
  }
}

export function isOptionalSchema(schema: z.ZodTypeAny): boolean {
  const def = (schema as { _def?: { typeName?: string } })._def;
  return def?.typeName === "ZodOptional" || def?.typeName === "ZodNullable";
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function formatLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialize non-finite number: ${value}`);
    }
    return String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  // Fallback: JSON-encode anything exotic.
  return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
}

export interface CreateTableOptions {
  ifNotExists?: boolean;
}

export function createTableSQL(
  t: AnyTable,
  options: CreateTableOptions = {},
): string {
  const lines: string[] = [];
  const ifNotExists = options.ifNotExists ? "IF NOT EXISTS " : "";

  // The `id` column is always primary key.
  const idType = sqliteTypeFor(t.id);
  lines.push(`  ${quoteIdent("id")} ${idType} PRIMARY KEY NOT NULL`);

  for (const [colName, schema] of Object.entries(t.columns)) {
    const sqlType = sqliteTypeFor(schema);
    const optional = isOptionalSchema(schema);
    const nullClause = optional ? "" : " NOT NULL";
    lines.push(`  ${quoteIdent(colName)} ${sqlType}${nullClause}`);
  }

  // Foreign key constraints.
  for (const [colName, schema] of Object.entries(t.columns)) {
    const fk = getForeignKey(schema);
    if (!fk) continue;
    lines.push(
      `  FOREIGN KEY (${quoteIdent(colName)}) REFERENCES ${quoteIdent(
        fk.table.name,
      )}(${quoteIdent(fk.column)})`,
    );
  }

  return `CREATE TABLE ${ifNotExists}${quoteIdent(t.name)} (\n${lines.join(
    ",\n",
  )}\n);`;
}

export function insertRowSQL<T extends AnyTable>(
  t: T,
  data: Record<string, unknown>,
): string {
  const columnOrder = ["id", ...Object.keys(t.columns)];
  const cols = columnOrder.map(quoteIdent).join(", ");
  const values = columnOrder.map((c) => formatLiteral(data[c])).join(", ");
  return `INSERT INTO ${quoteIdent(t.name)} (${cols}) VALUES (${values});`;
}

export function insertRowsSQL<T extends AnyTable>(
  t: T,
  rows: Record<string, unknown>[],
): string {
  if (rows.length === 0) return "";
  const columnOrder = ["id", ...Object.keys(t.columns)];
  const cols = columnOrder.map(quoteIdent).join(", ");
  const valuesList = rows
    .map(
      (row) =>
        `(${columnOrder.map((c) => formatLiteral(row[c])).join(", ")})`,
    )
    .join(",\n  ");
  return `INSERT INTO ${quoteIdent(t.name)} (${cols}) VALUES\n  ${valuesList};`;
}

/** Build the row-validator zod schema for a table. */
export function rowSchemaFor<T extends AnyTable>(t: T): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = { id: t.id };
  for (const [k, v] of Object.entries(t.columns)) {
    shape[k] = v;
  }
  return z.object(shape).strict();
}

/** Convenience used when emitting the full database schema. */
export function pragmaForeignKeysOn(): string {
  return "PRAGMA foreign_keys = ON;";
}

export function commentBanner(name: string): string {
  return `-- ${name}`;
}

export type { Table };
