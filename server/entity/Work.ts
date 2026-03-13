import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm';
import { WorkStatus } from '../constants/work';
import { WorkAuthor } from './WorkAuthor';
import { Edition } from './Edition';
import { WorkAvailability } from './WorkAvailability';
import { Series } from './Series';

@Entity()
export class Work {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  hardcoverId: string;

  @Column({ nullable: true })
  @Index()
  openLibraryWorkId?: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  originalTitle?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ nullable: true })
  coverUrl?: string;

  @Column({ nullable: true })
  publishedDate?: string;

  @Column({ nullable: true, type: 'integer' })
  pageCount?: number;

  @Column({ nullable: true, type: 'real' })
  averageRating?: number;

  @Column({ nullable: true, type: 'integer' })
  ratingsCount?: number;

  @Column({ nullable: true })
  sourceUrl?: string;

  @Column({ type: 'text', nullable: true })
  genresJson?: string;

  @Column({ type: 'integer', default: WorkStatus.UNKNOWN })
  @Index()
  status: WorkStatus;

  @Column({ type: 'boolean', default: false })
  ebookAvailable: boolean;

  @Column({ type: 'boolean', default: false })
  audiobookAvailable: boolean;

  @Column({ type: 'boolean', default: false })
  hasEbookEdition: boolean;

  @Column({ type: 'boolean', default: false })
  hasAudiobookEdition: boolean;

  // 'hardcover' | 'openlibrary' | 'googlebooks' | 'manual'
  @Column({ nullable: true })
  metadataSource?: string;

  @Column({ nullable: true })
  lastMetadataRefresh?: Date;

  // Relations
  @OneToMany(() => WorkAuthor, (workAuthor) => workAuthor.work)
  authors: WorkAuthor[];

  @OneToMany(() => Edition, (edition) => edition.work)
  editions: Edition[];

  @OneToMany(() => WorkAvailability, (availability) => availability.work)
  availability: WorkAvailability[];

  @ManyToOne(() => Series, (series) => series.works, { nullable: true })
  series?: Series;

  @Column({ nullable: true, type: 'real' })
  seriesPosition?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
