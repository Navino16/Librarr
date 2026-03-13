import { User } from '../entity/User';
import 'express-session';
import 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    oidcState?: string;
    oidcCodeVerifier?: string;
    oidcProviderId?: string;
    oidcReturnUrl?: string;
  }
}

declare module 'express' {
  interface Request {
    user?: User;
  }
}

declare module 'express-serve-static-core' {
  interface ParamsDictionary {
    [key: string]: string;
  }
}

export {};
