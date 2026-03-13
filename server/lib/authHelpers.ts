import dataSource from '../datasource';
import { User } from '../entity/User';
import { UserType } from '../constants/user';
import logger from '../logger';

export interface ExternalIdentity {
  type: 'plex' | 'oidc';
  // Plex fields
  plexId?: string;
  plexToken?: string;
  // OIDC fields
  oidcSub?: string;
  oidcIssuer?: string;
  // Shared
  email?: string;
  username?: string;
  avatar?: string;
}

/**
 * Find an existing user by external identity or email, or create a new one.
 * Returns null if auto-creation is disabled and no user was found.
 *
 * Logic:
 * 1. Find by external ID (plexId or oidcSub+oidcIssuer)
 * 2. Find by email (case-insensitive) and link
 * 3. Create new user if autoCreate is true
 */
export async function findOrCreateUser(
  identity: ExternalIdentity,
  autoCreate: boolean,
  defaultPermissions: number
): Promise<User | null> {
  const userRepository = dataSource.getRepository(User);

  // 1. Find by external ID
  let user: User | null = null;

  if (identity.type === 'plex' && identity.plexId) {
    user = await userRepository.findOne({
      where: { plexId: identity.plexId },
    });
  } else if (identity.type === 'oidc' && identity.oidcSub && identity.oidcIssuer) {
    user = await userRepository.findOne({
      where: { oidcSub: identity.oidcSub, oidcIssuer: identity.oidcIssuer },
    });
  }

  // 2. If not found, try matching by email
  if (!user && identity.email) {
    user = await userRepository.findOne({
      where: { email: identity.email.toLowerCase() },
    });
    if (user) {
      // Link existing account to external identity
      if (identity.type === 'plex') {
        user.plexId = identity.plexId;
        user.plexToken = identity.plexToken;
      } else if (identity.type === 'oidc') {
        user.oidcSub = identity.oidcSub;
        user.oidcIssuer = identity.oidcIssuer;
      }
      if (identity.avatar && !user.avatar) {
        user.avatar = identity.avatar;
      }
      await userRepository.save(user);
      logger.info(`Linked existing user to ${identity.type} account`, {
        userId: user.id,
        ...(identity.type === 'plex' ? { plexId: identity.plexId } : { oidcSub: identity.oidcSub }),
      });
    }
  }

  // 3. Create new user if auto-create is enabled
  if (!user) {
    if (!autoCreate) {
      return null;
    }

    const userType = identity.type === 'plex' ? UserType.PLEX : UserType.OIDC;
    user = userRepository.create({
      email: identity.email?.toLowerCase() || undefined,
      username: identity.username || identity.email || identity.oidcSub || 'User',
      plexId: identity.type === 'plex' ? identity.plexId : undefined,
      plexToken: identity.type === 'plex' ? identity.plexToken : undefined,
      oidcSub: identity.type === 'oidc' ? identity.oidcSub : undefined,
      oidcIssuer: identity.type === 'oidc' ? identity.oidcIssuer : undefined,
      userType,
      permissions: defaultPermissions,
      avatar: identity.avatar || undefined,
    });
    await userRepository.save(user);
    logger.info(`Created new user from ${identity.type} login`, {
      userId: user.id,
      ...(identity.type === 'plex' ? { plexId: identity.plexId } : { oidcSub: identity.oidcSub }),
    });
  } else if (identity.type === 'plex' && identity.plexToken) {
    // Update token for existing user
    user.plexToken = identity.plexToken;
    await userRepository.save(user);
  }

  return user;
}
