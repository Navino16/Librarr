import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { WorkAuthor } from './WorkAuthor';

@Entity()
export class Author {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  hardcoverId: string;

  @Column()
  @Index()
  name: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ nullable: true })
  photoUrl?: string;

  @Column({ nullable: true })
  sourceUrl?: string;

  @OneToMany(() => WorkAuthor, (workAuthor) => workAuthor.author)
  works: WorkAuthor[];

  @CreateDateColumn()
  createdAt: Date;
}
