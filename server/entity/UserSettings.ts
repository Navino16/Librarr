import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';

@Entity()
export class UserSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, (user) => user.settings)
  @JoinColumn()
  user: User;

  @Column({ default: 'en' })
  locale: string;

  // Default: all notification types enabled (all flags set except TEST_NOTIFICATION)
  @Column({ type: 'integer', default: 1023 })
  notificationTypes: number;

  @Column({ nullable: true })
  discordId?: string;

  @Column({ nullable: true })
  telegramChatId?: string;

  @Column({ nullable: true })
  pushbulletAccessToken?: string;

  @Column({ nullable: true })
  pushoverApplicationToken?: string;

  @Column({ nullable: true })
  pushoverUserKey?: string;
}
