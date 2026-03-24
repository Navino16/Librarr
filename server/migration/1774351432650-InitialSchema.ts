import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1774351432650 implements MigrationInterface {
    name = 'InitialSchema1774351432650'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Skip if tables already exist (existing install created via synchronize)
        const tables = await queryRunner.query(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='user'`
        );
        if (tables.length > 0) {
            return;
        }

        // Independent tables (no FK dependencies)
        await queryRunner.query(`CREATE TABLE "author" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hardcoverId" varchar NOT NULL, "name" varchar NOT NULL, "bio" text, "photoUrl" varchar, "sourceUrl" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_404587d7728dad3f05020ff125e" UNIQUE ("hardcoverId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d3962fd11a54d87f927e84d108" ON "author" ("name") `);

        await queryRunner.query(`CREATE TABLE "series" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hardcoverId" varchar NOT NULL, "name" varchar NOT NULL, "booksCount" integer, CONSTRAINT "UQ_60b3abaca932810a535b9e20c91" UNIQUE ("hardcoverId"))`);

        await queryRunner.query(`CREATE TABLE "user" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "email" varchar, "username" varchar NOT NULL, "password" varchar, "jellyfinUserId" varchar, "jellyfinToken" varchar, "plexId" varchar, "plexToken" varchar, "oidcSub" varchar, "oidcIssuer" varchar, "userType" integer NOT NULL DEFAULT (3), "permissions" integer NOT NULL DEFAULT (0), "avatar" varchar, "ebookQuotaLimit" integer, "audiobookQuotaLimit" integer, "musicQuotaLimit" integer, "resetPasswordGuid" varchar, "resetPasswordExpiry" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"))`);

        await queryRunner.query(`CREATE TABLE "session" ("id" varchar(255) PRIMARY KEY NOT NULL, "expiredAt" bigint NOT NULL, "json" text NOT NULL, "destroyedAt" datetime)`);
        await queryRunner.query(`CREATE INDEX "IDX_28c5d1d16da7908c97c9bc2f74" ON "session" ("expiredAt") `);

        await queryRunner.query(`CREATE TABLE "music_album" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "musicBrainzId" varchar NOT NULL, "spotifyId" varchar, "foreignAlbumId" varchar, "title" varchar NOT NULL, "artistName" varchar, "artistForeignId" varchar, "coverUrl" varchar, "releaseDate" varchar, "albumType" varchar, "genresJson" text, "status" integer NOT NULL DEFAULT (1), "available" boolean NOT NULL DEFAULT (0), "serviceId" integer, "externalServiceId" integer, "externalServiceSlug" varchar, "mediaAddedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_125ff75eebb4263319bf95dbb1e" UNIQUE ("musicBrainzId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_530bcb377c30d3ad933446ffee" ON "music_album" ("status") `);

        await queryRunner.query(`CREATE TABLE "unmatched_media_item" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceItemId" varchar NOT NULL, "source" varchar NOT NULL DEFAULT ('audiobookshelf'), "title" varchar NOT NULL, "authors" varchar, "isbn" varchar, "asin" varchar, "format" varchar NOT NULL, "libraryName" varchar, "sourceUrl" varchar, "reason" varchar NOT NULL DEFAULT ('unmatched'), "firstSeenAt" datetime NOT NULL DEFAULT (datetime('now')), "lastAttemptedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_ce7a991c624abc089e2fed13702" UNIQUE ("sourceItemId"))`);

        // Tables with FK to user
        await queryRunner.query(`CREATE TABLE "user_settings" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "locale" varchar NOT NULL DEFAULT ('en'), "notificationTypes" integer NOT NULL DEFAULT (1023), "discordId" varchar, "telegramChatId" varchar, "pushbulletAccessToken" varchar, "pushoverApplicationToken" varchar, "pushoverUserKey" varchar, "userId" integer, CONSTRAINT "REL_986a2b6d3c05eb4091bb8066f7" UNIQUE ("userId"), CONSTRAINT "FK_986a2b6d3c05eb4091bb8066f78" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);

        // Tables with FK to series
        await queryRunner.query(`CREATE TABLE "work" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "hardcoverId" varchar NOT NULL, "openLibraryWorkId" varchar, "title" varchar NOT NULL, "originalTitle" varchar, "description" text, "coverUrl" varchar, "publishedDate" varchar, "pageCount" integer, "averageRating" real, "ratingsCount" integer, "sourceUrl" varchar, "genresJson" text, "status" integer NOT NULL DEFAULT (1), "ebookAvailable" boolean NOT NULL DEFAULT (0), "audiobookAvailable" boolean NOT NULL DEFAULT (0), "hasEbookEdition" boolean NOT NULL DEFAULT (0), "hasAudiobookEdition" boolean NOT NULL DEFAULT (0), "metadataSource" varchar, "lastMetadataRefresh" datetime, "seriesPosition" real, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "seriesId" integer, CONSTRAINT "UQ_3ebc84693a729e8e38e9ea51168" UNIQUE ("hardcoverId"), CONSTRAINT "FK_36b4653a2bee454112d5854a8e7" FOREIGN KEY ("seriesId") REFERENCES "series" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE INDEX "IDX_2b776795c904962b5c400f4e7c" ON "work" ("openLibraryWorkId") `);
        await queryRunner.query(`CREATE INDEX "IDX_2479d7e493c59d111af97f8808" ON "work" ("status") `);

        // Tables with FK to work and author
        await queryRunner.query(`CREATE TABLE "work_author" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "role" varchar, "workId" integer, "authorId" integer, CONSTRAINT "FK_661d8f5cdb4bd215ad16301e0b1" FOREIGN KEY ("workId") REFERENCES "work" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_a2045b9fc41c357d2c98d5a9d60" FOREIGN KEY ("authorId") REFERENCES "author" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);

        // Tables with FK to work
        await queryRunner.query(`CREATE TABLE "edition" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "isbn13" varchar, "isbn10" varchar, "asin" varchar, "title" varchar, "publisher" varchar, "publishedDate" varchar, "language" varchar, "pageCount" integer, "coverUrl" varchar, "format" varchar NOT NULL, "matched" boolean NOT NULL DEFAULT (0), "source" varchar, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "workId" integer, CONSTRAINT "FK_c9e0982c8cc6db96c9d51134bfd" FOREIGN KEY ("workId") REFERENCES "work" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE INDEX "IDX_83902d5833c119513dc94029d4" ON "edition" ("isbn13") `);
        await queryRunner.query(`CREATE INDEX "IDX_c635b0053c6d7c33980a025fc6" ON "edition" ("isbn10") `);
        await queryRunner.query(`CREATE INDEX "IDX_0a9b768107197ee76d1eceaf87" ON "edition" ("asin") `);

        // Tables with FK to work and edition
        await queryRunner.query(`CREATE TABLE "work_availability" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "format" varchar NOT NULL, "source" varchar NOT NULL, "sourceItemId" varchar, "sourceUrl" varchar, "addedAt" datetime NOT NULL DEFAULT (datetime('now')), "lastVerifiedAt" datetime, "workId" integer, "matchedEditionId" integer, CONSTRAINT "FK_85fce118b4966220c5137fb6c0f" FOREIGN KEY ("workId") REFERENCES "work" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_e9ed572c25998383e79c9c92ed8" FOREIGN KEY ("matchedEditionId") REFERENCES "edition" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE INDEX "IDX_c2265a20825cfd3c5b88fe2c29" ON "work_availability" ("workId", "format", "source") `);

        // Tables with FK to work, user
        await queryRunner.query(`CREATE TABLE "book_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "format" varchar NOT NULL, "status" integer NOT NULL DEFAULT (1), "requestedLanguage" varchar, "readarrServerId" integer, "readarrBookId" integer, "authorForeignId" varchar, "downloadProgress" real, "downloadStatus" varchar, "downloadTimeLeft" varchar, "declineReason" varchar, "isAutoRequest" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "workId" integer, "requestedById" integer, "modifiedById" integer, CONSTRAINT "FK_aa0d93f09aa9e872ce00a4962f3" FOREIGN KEY ("workId") REFERENCES "work" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_ed863d2b3d2dddec972b2f97a2c" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_18d3484c3e9acb85af0a8945432" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE INDEX "IDX_7a21537b65168ec3714115e1e5" ON "book_request" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_5a2cd6046c7300421bc91c2eaf" ON "book_request" ("workId", "format", "status") `);

        // Tables with FK to music_album, user
        await queryRunner.query(`CREATE TABLE "music_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "lidarrServerId" integer, "lidarrAlbumId" integer, "artistForeignId" varchar, "downloadProgress" real, "downloadStatus" varchar, "downloadTimeLeft" varchar, "declineReason" varchar, "isAutoRequest" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "albumId" integer, "requestedById" integer, "modifiedById" integer, CONSTRAINT "FK_4a7d95f3265c7f1111db3004b65" FOREIGN KEY ("albumId") REFERENCES "music_album" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_aab327d21bdb8d5c124c7b965d3" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_33c12486cea1c574d218152abde" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE INDEX "IDX_b738682b14f660245ddf6b33f1" ON "music_request" ("status") `);

        // Tables with FK to work, music_album, user
        await queryRunner.query(`CREATE TABLE "issue" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "issueType" integer NOT NULL, "status" integer NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "workId" integer, "musicAlbumId" integer, "createdById" integer, "modifiedById" integer, CONSTRAINT "FK_f49b84392d5b169ca147338707a" FOREIGN KEY ("workId") REFERENCES "work" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_b2462c9fb6c4eee9ecc9052e3ef" FOREIGN KEY ("musicAlbumId") REFERENCES "music_album" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_10b17b49d1ee77e7184216001e0" FOREIGN KEY ("createdById") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_da88a1019c850d1a7b143ca02e5" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`CREATE INDEX "IDX_e7c81e44d6dd168bce123cc31e" ON "issue" ("status") `);

        // Tables with FK to user, issue
        await queryRunner.query(`CREATE TABLE "issue_comment" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "message" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "userId" integer, "issueId" integer, CONSTRAINT "FK_707b033c2d0653f75213614789d" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_180710fead1c94ca499c57a7d42" FOREIGN KEY ("issueId") REFERENCES "issue" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop in reverse dependency order
        await queryRunner.query(`DROP TABLE IF EXISTS "issue_comment"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "issue"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "music_request"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "book_request"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "work_availability"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "edition"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "work_author"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "work"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "user_settings"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "unmatched_media_item"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "music_album"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "session"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "user"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "series"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "author"`);
    }

}
