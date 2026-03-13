import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { UserType } from '../constants/user';
import { BookRequest } from './BookRequest';
import { MusicRequest } from './MusicRequest';
import { Issue } from './Issue';
import { UserSettings } from './UserSettings';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, nullable: true })
  email?: string;

  @Column()
  username: string;

  @Column({ nullable: true, select: false })
  password?: string;

  @Column({ nullable: true })
  jellyfinUserId?: string;

  @Column({ nullable: true, select: false })
  jellyfinToken?: string;

  @Column({ nullable: true })
  plexId?: string;

  @Column({ nullable: true, select: false })
  plexToken?: string;

  @Column({ nullable: true })
  oidcSub?: string;

  @Column({ nullable: true })
  oidcIssuer?: string;

  @Column({ type: 'integer', default: UserType.LOCAL })
  userType: UserType;

  @Column({ type: 'integer', default: 0 })
  permissions: number;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ nullable: true, type: 'integer' })
  ebookQuotaLimit?: number;

  @Column({ nullable: true, type: 'integer' })
  audiobookQuotaLimit?: number;

  @Column({ nullable: true, type: 'integer' })
  musicQuotaLimit?: number;

  @Column({ nullable: true, select: false })
  resetPasswordGuid?: string;

  @Column({ nullable: true, type: 'datetime', select: false })
  resetPasswordExpiry?: Date;

  @OneToMany(() => BookRequest, (request) => request.requestedBy)
  bookRequests: BookRequest[];

  @OneToMany(() => MusicRequest, (request) => request.requestedBy)
  musicRequests: MusicRequest[];

  @OneToMany(() => Issue, (issue) => issue.createdBy)
  issues: Issue[];

  @OneToOne(() => UserSettings, (settings) => settings.user, { cascade: true })
  settings?: UserSettings;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
