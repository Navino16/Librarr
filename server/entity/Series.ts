import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { Work } from './Work';

@Entity()
export class Series {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  hardcoverId: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'integer' })
  booksCount?: number;

  @OneToMany(() => Work, (work) => work.series)
  works: Work[];
}
