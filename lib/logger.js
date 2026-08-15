import pino from 'pino'

const level = process.env.LOG_LEVEL || 'info'

const logger = pino({
  level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
})

// Baileys protokol seviyesinde çok konuşkandır ve debug/trace seviyesinde
// oturum anahtarlarını ham haliyle basar. Bu yüzden ona ayrı, kısıtlı bir
// child logger verilir; uygulama loglarının seviyesi bunu etkilemez.
export const baileysLogger = logger.child({ module: 'baileys' }, { level: 'warn' })

export default logger
