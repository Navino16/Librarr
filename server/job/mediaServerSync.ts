// ---------------------------------------------------------------------------
// Media Server Full Sync — daily deep scan of all media servers
//
// Delegates to availabilitySync with fullScan=true so the log output
// clearly differentiates the daily 4:00 AM rescan from the 15-min
// incremental sync.
// ---------------------------------------------------------------------------

import logger from '../logger';
import { availabilitySync } from './availabilitySync';

export async function mediaServerSync(): Promise<void> {
  logger.info('Media server full sync: starting daily rescan');

  try {
    await availabilitySync({ fullScan: true });
    logger.info('Media server full sync: complete');
  } catch (e) {
    logger.error('Media server full sync: failed', { error: String(e) });
  }
}
