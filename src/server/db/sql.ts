/** Tiny helper for building parameterised SQL with dynamic filters. Values are never interpolated. */
export class SqlParams {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/** Escapes LIKE/ILIKE wildcards in user input. */
export function likeEscape(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const PAGE_SIZE = 12;

export function pageOffset(page: number | undefined, size = PAGE_SIZE): number {
  const p = Number.isFinite(page) && page! > 0 ? Math.floor(page!) : 1;
  return (p - 1) * size;
}
