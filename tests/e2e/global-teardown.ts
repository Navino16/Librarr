import fs from 'fs';
import path from 'path';

const TEST_CONFIG_DIR = path.join(__dirname, '.test-config');
const SETUP_CONFIG_DIR = path.join(__dirname, '.test-config-setup');

export default function globalTeardown() {
  for (const dir of [TEST_CONFIG_DIR, SETUP_CONFIG_DIR]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }
  }
}
