import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { IssueType, IssueStatus } from '../constants/issue';
import { Work } from './Work';
import { MusicAlbum } from './MusicAlbum';
import { User } from './User';
import { IssueComment } from './IssueComment';

@Entity()
export class Issue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  issueType: IssueType;

  @Column({ type: 'integer', default: IssueStatus.OPEN })
  @Index()
  status: IssueStatus;

  @ManyToOne(() => Work, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  work?: Work;

  @ManyToOne(() => MusicAlbum, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  musicAlbum?: MusicAlbum;

  @ManyToOne(() => User, (user) => user.issues)
  createdBy: User;

  @ManyToOne(() => User, { nullable: true })
  modifiedBy?: User;

  @OneToMany(() => IssueComment, (comment) => comment.issue)
  comments: IssueComment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
