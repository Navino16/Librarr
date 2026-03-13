/**
 * Validates a hostname/port pair for use in test connection endpoints.
 * Returns an error string if invalid, or null if ok.
 */
export async function validateConnectionTarget(
  hostname: unknown,
  port: unknown
): Promise<string | null> {
  if (!hostname || typeof hostname !== 'string') {
    return 'hostname is required';
  }

  const h = hostname.trim().toLowerCase();

  if (h.length === 0 || h.length > 253) {
    return 'hostname must be between 1 and 253 characters';
  }

  if (port !== undefined && port !== null) {
    const p = typeof port === 'string' ? parseInt(port, 10) : port;
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 1 || p > 65535) {
      return 'port must be between 1 and 65535';
    }
  }

  return null;
}
