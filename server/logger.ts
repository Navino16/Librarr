import winston from 'winston';
import path from 'path';

const CONFIG_DIR = path.join(process.cwd(), 'config');

const SENSITIVE_KEYS = ['password', 'apiKey', 'apikey', 'token', 'secret', 'authorization'];

const redactSecrets = winston.format((info) => {
  if (typeof info === 'object' && info !== null) {
    for (const key of Object.keys(info)) {
      if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s)) && typeof info[key] === 'string') {
        info[key] = '[REDACTED]';
      }
    }
  }
  return info;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactSecrets(),
    winston.format.json()
  ),
  defaultMeta: { service: 'librarr' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length > 1 ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
  ],
});

if (process.env.NODE_ENV === 'production') {
  import('winston-daily-rotate-file')
    .then((mod) => {
      const DailyRotateFile = mod.default;
      logger.add(
        new DailyRotateFile({
          filename: path.join(CONFIG_DIR, 'logs', 'librarr-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
        })
      );
    })
    .catch(() => {
      console.warn('winston-daily-rotate-file not available, file logging disabled. Install it for persistent log files.');
    });
}

export default logger;
