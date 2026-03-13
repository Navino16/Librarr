import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RequestStatus } from '../constants/work';
import { MusicAlbum } from './MusicAlbum';
import { User } from './User';

@Entity()
export class MusicRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MusicAlbum, (album) => album.requests, {
    onDelete: 'CASCADE',
  })
  album: MusicAlbum;

  @ManyToOne(() => User)
  requestedBy: User;

  @ManyToOne(() => User, { nullable: true })
  modifiedBy?: User;

  @Column({ type: 'integer', default: RequestStatus.PENDING })
  @Index()
  status: RequestStatus;

  @Column({ nullable: true, type: 'integer' })
  lidarrServerId?: number;

  @Column({ nullable: true, type: 'integer' })
  lidarrAlbumId?: number;

  // Lidarr foreign artist ID used when adding the album
  @Column({ nullable: true })
  artistForeignId?: string;

  @Column({ nullable: true, type: 'real' })
  downloadProgress?: number;

  @Column({ nullable: true })
  downloadStatus?: string;

  @Column({ nullable: true })
  downloadTimeLeft?: string;

  @Column({ nullable: true })
  declineReason?: string;

  @Column({ default: false })
  isAutoRequest: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
