import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { User } from './entity/User';
import { UserSettings } from './entity/UserSettings';
import { Work } from './entity/Work';
import { Edition } from './entity/Edition';
import { WorkAvailability } from './entity/WorkAvailability';
import { Author } from './entity/Author';
import { WorkAuthor } from './entity/WorkAuthor';
import { Series } from './entity/Series';
import { BookRequest } from './entity/BookRequest';
import { MusicAlbum } from './entity/MusicAlbum';
import { MusicRequest } from './entity/MusicRequest';
import { Issue } from './entity/Issue';
import { IssueComment } from './entity/IssueComment';
import { Session } from './entity/Session';
import { UnmatchedMediaItem } from './entity/UnmatchedMediaItem';

const CONFIG_DIR = process.env.CONFIG_DIR || path.join(process.cwd(), 'config');

const isProduction = process.env.NODE_ENV === 'production';
const synchronize = process.env.DB_SYNCHRONIZE === 'true';

if (isProduction && synchronize) {
  console.warn(
    '⚠️  WARNING: DB_SYNCHRONIZE=true in production! This can cause data loss. ' +
    'Use migrations instead. Set DB_SYNCHRONIZE=false for safety.'
  );
}

const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: path.join(CONFIG_DIR, 'db', 'librarr.db'),
  synchronize: isProduction ? false : synchronize,
  migrationsRun: isProduction,
  logging: false,
  enableWAL: true,
  entities: [
    User,
    UserSettings,
    Work,
    Edition,
    WorkAvailability,
    Author,
    WorkAuthor,
    Series,
    BookRequest,
    MusicAlbum,
    MusicRequest,
    Issue,
    IssueComment,
    Session,
    UnmatchedMediaItem,
  ],
  migrations: [path.join(__dirname, 'migration', '*.{ts,js}')],
  subscribers: [path.join(__dirname, 'subscriber', '*.{ts,js}')],
});

export default dataSource;
