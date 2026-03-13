import { ISession } from 'connect-typeorm';
import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  DeleteDateColumn,
} from 'typeorm';

@Entity()
export class Session implements ISession {
  @PrimaryColumn('varchar', { length: 255 })
  id: string;

  @Index()
  @Column('bigint')
  expiredAt: number = Date.now();

  @Column('text')
  json: string = '';

  @DeleteDateColumn()
  destroyedAt?: Date;
}
