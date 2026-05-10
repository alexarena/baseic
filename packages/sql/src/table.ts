import { z } from "zod";

/**
 * A foreign-key column. At runtime it is a regular zod schema with extra
 * metadata attached so the SQL generator can emit a FOREIGN KEY clause and
 * the runtime validator can check that the referenced row exists.
 */
export interface ForeignKeyMeta<
  TTable extends AnyTable = AnyTable,
  TColumn extends string = string,
> {
  table: TTable;
  column: TColumn;
}

export type ForeignKeyColumn<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TTable extends AnyTable = AnyTable,
  TColumn extends string = string,
> = TSchema & { readonly __fk: ForeignKeyMeta<TTable, TColumn> };

/**
 * Wrap a zod schema with foreign-key metadata.
 *
 * Example: `foreignKey(Accounts, "id", z.string())`
 */
export function foreignKey<
  TTable extends AnyTable,
  TColumn extends ForeignKeyTargetColumn<TTable>,
  TSchema extends z.ZodTypeAny,
>(
  table: TTable,
  column: TColumn,
  schema: TSchema,
): ForeignKeyColumn<TSchema, TTable, TColumn> {
  // Attach metadata as a non-enumerable property so it doesn't interfere
  // with zod's internals but is still accessible to the SQL generator.
  Object.defineProperty(schema, "__fk", {
    value: { table, column } satisfies ForeignKeyMeta<TTable, TColumn>,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return schema as ForeignKeyColumn<TSchema, TTable, TColumn>;
}

/** Identity helper that gives `columns({...})` a place to live in the API. */
export function columns<TCols extends Record<string, z.ZodTypeAny>>(
  cols: TCols,
): TCols {
  return cols;
}

export interface TableInput<
  TName extends string,
  TId extends z.ZodTypeAny,
  TCols extends Record<string, z.ZodTypeAny>,
> {
  name: TName;
  id: TId;
  columns: TCols;
}

export interface Table<
  TName extends string = string,
  TId extends z.ZodTypeAny = z.ZodTypeAny,
  TCols extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
> {
  readonly name: TName;
  readonly id: TId;
  readonly columns: TCols;
  /** Phantom field used purely for type inference of inserted rows. */
  readonly __row?: RowOf<TId, TCols>;
}

export type AnyTable = Table<string, z.ZodTypeAny, Record<string, z.ZodTypeAny>>;

/** The TypeScript shape of a row to insert into the given table. */
export type RowOf<
  TId extends z.ZodTypeAny,
  TCols extends Record<string, z.ZodTypeAny>,
> = { id: z.infer<TId> } & { [K in keyof TCols]: z.infer<TCols[K]> };

export type RowForTable<T extends AnyTable> = RowOf<T["id"], T["columns"]>;

/** Names of columns on the given table that may be targeted by a foreign key. */
export type ForeignKeyTargetColumn<T extends AnyTable> = "id" | (keyof T["columns"] & string);

export function table<
  TName extends string,
  TId extends z.ZodTypeAny,
  TCols extends Record<string, z.ZodTypeAny>,
>(input: TableInput<TName, TId, TCols>): Table<TName, TId, TCols> {
  return {
    name: input.name,
    id: input.id,
    columns: input.columns,
  };
}

/** Read foreign-key metadata off a column schema, if any. */
export function getForeignKey(
  schema: z.ZodTypeAny,
): ForeignKeyMeta | undefined {
  return (schema as { __fk?: ForeignKeyMeta }).__fk;
}
