import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class UnmatchedMediaItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  sourceItemId: string;

  @Column({ default: 'audiobookshelf' })
  source: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  authors?: string;

  @Column({ nullable: true })
  isbn?: string;

  @Column({ nullable: true })
  asin?: string;

  @Column()
  format: string;

  @Column({ nullable: true })
  libraryName?: string;

  @Column({ nullable: true })
  sourceUrl?: string;

  // 'unmatched' = no Hardcover match, 'duplicate' = another ABS item already covers this work+format
  @Column({ default: 'unmatched' })
  reason: string;

  @CreateDateColumn()
  firstSeenAt: Date;

  @UpdateDateColumn()
  lastAttemptedAt: Date;
}
