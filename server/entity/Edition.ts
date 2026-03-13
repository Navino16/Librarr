import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Work } from './Work';

@Entity()
export class Edition {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Work, (work) => work.editions, {
    onDelete: 'CASCADE',
  })
  work: Work;

  @Column({ nullable: true })
  @Index()
  isbn13?: string;

  @Column({ nullable: true })
  @Index()
  isbn10?: string;

  @Column({ nullable: true })
  @Index()
  asin?: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  publisher?: string;

  @Column({ nullable: true })
  publishedDate?: string;

  // ISO 639-1 language code
  @Column({ nullable: true })
  language?: string;

  @Column({ nullable: true, type: 'integer' })
  pageCount?: number;

  @Column({ nullable: true })
  coverUrl?: string;

  @Column({ type: 'varchar' })
  format: string;

  @Column({ type: 'boolean', default: false })
  matched: boolean;

  // 'hardcover' | 'openlibrary' | 'googlebooks'
  @Column({ nullable: true })
  source?: string;

  @CreateDateColumn()
  createdAt: Date;
}
