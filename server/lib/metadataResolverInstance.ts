import { MetadataResolver } from '../api/metadata';
import Settings from './settings';

/**
 * Shared MetadataResolver instance that reads configuration from Settings.
 *
 * The resolver is lazily initialized on first access and can be reset
 * (e.g. when metadata provider settings change) by calling
 * `resetMetadataResolver()`.
 */
let instance: MetadataResolver | null = null;

/**
 * Get (or lazily create) the shared MetadataResolver instance,
 * configured from the current Settings.
 */
export function getMetadataResolver(): MetadataResolver {
  if (!instance) {
    const settings = Settings.getInstance();
    instance = new MetadataResolver(settings.metadataProviders);
  }
  return instance;
}

/**
 * Reset the shared MetadataResolver so that the next call to
 * `getMetadataResolver()` creates a fresh instance with the latest settings.
 * Call this whenever metadata provider settings are updated.
 */
export function resetMetadataResolver(): void {
  instance = null;
}
