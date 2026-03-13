import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { RequestStatus, BookFormat } from '../constants/work';
import { Work } from './Work';
import { User } from './User';

@Entity()
@Index(['work', 'format', 'status'])
export class BookRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Work, {
    onDelete: 'CASCADE',
  })
  work: Work;

  @ManyToOne(() => User)
  requestedBy: User;

  @ManyToOne(() => User, { nullable: true })
  modifiedBy?: User;

  @Column({ type: 'varchar' })
  format: BookFormat;

  @Column({ type: 'integer', default: RequestStatus.PENDING })
  @Index()
  status: RequestStatus;

  // ISO 639-1 language code for the requested edition language
  @Column({ type: 'varchar', nullable: true })
  requestedLanguage?: string;

  @Column({ nullable: true, type: 'integer' })
  readarrServerId?: number;

  @Column({ nullable: true, type: 'integer' })
  readarrBookId?: number;

  // Readarr foreign author ID used when adding the book
  @Column({ nullable: true })
  authorForeignId?: string;

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
