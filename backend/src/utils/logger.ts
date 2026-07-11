import winston from 'winston';

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...meta } = info;
    
    // Filter out winston system symbols to keep JSON output clean
    const cleanMeta = { ...meta };
    delete cleanMeta[Symbol.for('level') as any];
    delete cleanMeta[Symbol.for('message') as any];
    delete cleanMeta[Symbol.for('splat') as any];

    const metaStr = Object.keys(cleanMeta).length ? ` ${JSON.stringify(cleanMeta)}` : '';
    const lvl = typeof level === 'string' ? level.toUpperCase() : 'INFO';
    return `[${timestamp}] [${lvl}]: ${message}${metaStr}`;
  })
);

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }),
      format
    ),
  }),
];

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  levels,
  transports,
});
