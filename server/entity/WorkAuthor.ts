import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { Work } from './Work';
import { Author } from './Author';

@Entity()
export class WorkAuthor {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Work, (work) => work.authors, {
    onDelete: 'CASCADE',
  })
  work: Work;

  @ManyToOne(() => Author, (author) => author.works, {
    onDelete: 'CASCADE',
  })
  author: Author;

  // 'author' | 'narrator' | 'illustrator'
  @Column({ nullable: true })
  role?: string;
}
