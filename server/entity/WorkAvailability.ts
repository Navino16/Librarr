import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Work } from './Work';
import { Edition } from './Edition';

@Entity()
@Index(['work', 'format', 'source'])
export class WorkAvailability {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Work, (work) => work.availability, {
    onDelete: 'CASCADE',
  })
  work: Work;

  // 'ebook' | 'audiobook'
  @Column({ type: 'varchar' })
  format: string;

  // 'audiobookshelf'
  @Column({ type: 'varchar' })
  source: string;

  @Column({ nullable: true })
  sourceItemId?: string;

  @Column({ nullable: true })
  sourceUrl?: string;

  @ManyToOne(() => Edition, { nullable: true })
  matchedEdition?: Edition;

  @CreateDateColumn()
  addedAt: Date;

  @Column({ nullable: true })
  lastVerifiedAt?: Date;
}
