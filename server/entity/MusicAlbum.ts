import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { MusicAlbumStatus, MusicAlbumType } from '../constants/music';
import { MusicRequest } from './MusicRequest';

@Entity()
export class MusicAlbum {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  musicBrainzId: string;

  @Column({ nullable: true })
  spotifyId?: string;

  // Lidarr foreign album ID
  @Column({ nullable: true })
  foreignAlbumId?: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  artistName?: string;

  // MusicBrainz / Lidarr foreign artist ID
  @Column({ nullable: true })
  artistForeignId?: string;

  @Column({ nullable: true })
  coverUrl?: string;

  @Column({ nullable: true })
  releaseDate?: string;

  // 'album' | 'single' | 'ep'
  @Column({ type: 'varchar', nullable: true })
  albumType?: MusicAlbumType;

  // JSON string of genres array
  @Column({ type: 'text', nullable: true })
  genresJson?: string;

  @Column({ type: 'integer', default: MusicAlbumStatus.UNKNOWN })
  @Index()
  status: MusicAlbumStatus;

  @Column({ type: 'boolean', default: false })
  available: boolean;

  // External service tracking (Lidarr)
  @Column({ nullable: true, type: 'integer' })
  serviceId?: number;

  @Column({ nullable: true, type: 'integer' })
  externalServiceId?: number;

  @Column({ nullable: true })
  externalServiceSlug?: string;

  @Column({ nullable: true })
  mediaAddedAt?: Date;

  @OneToMany(() => MusicRequest, (request) => request.album)
  requests: MusicRequest[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
