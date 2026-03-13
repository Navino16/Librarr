/**
 * Extract a route parameter as string.
 * Express 5 changed req.params values to string | string[].
 */
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/**
 * Parse a string parameter as integer ID, returning null if invalid.
 */
export function parseId(value: string): number | null {
  const id = parseInt(value, 10);
  return isNaN(id) || id < 1 ? null : id;
}

/**
 * Safely parse a pagination parameter (take/skip), returning the default if invalid.
 * Ensures the result is non-negative.
 */
export function safeInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? defaultValue : parsed;
}
