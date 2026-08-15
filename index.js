import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import qrcode from 'qrcode-terminal'
import logger, { baileysLogger } from './lib/logger.js'
import { handleMessage } from './lib/handler.js'
import { trackOutgoing } from './lib/outgoing.js'
import { loadCommands } from './commands/index.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const AUTH_DIR = path.join(ROOT, 'auth')
const MAX_BACKOFF_MS = 30_000

// Yeniden bağlanınca biriken mesajlar topluca düşer; eskiler işlenirse komutlar
// ikinci kez çalışır.
const MAX_MESSAGE_AGE_SEC = 90

// Baileys zaman damgasını bazen düz sayı, bazen protobuf Long verir.
function ageSeconds(timestamp) {
  if (!timestamp) return 0
  const seconds = typeof timestamp === 'object' ? Number(timestamp.low ?? 0) : Number(timestamp)
  if (!seconds) return 0
  return Date.now() / 1000 - seconds
}

let commands = new Map()
let reconnectAttempts = 0

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
    },
    logger: baileysLogger,
    browser: Browsers.macOS('Desktop'),
    markOnlineOnConnect: false,
  })

  // Gönderilen mesajların id'sini not eder; handler botun kendi yanıtlarını
  // istatistiğe ve "son yazan" kaydına sokmasın diye buna bakar.
  trackOutgoing(sock)

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    // printQRInTerminal deprecated; QR bu event'ten alınıp elle basılır.
    if (qr) {
      logger.info('QR kodu telefondan okut: WhatsApp > Bağlı cihazlar > Cihaz bağla')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      reconnectAttempts = 0
      logger.info('Bağlantı kuruldu. Bot hazır.')
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode

      // Oturum kapatılmışsa yeniden bağlanmak sonsuz döngüdür: kimlik
      // bilgileri artık geçersiz, yeni QR gerekiyor.
      if (statusCode === DisconnectReason.loggedOut) {
        logger.error(
          `Oturum kapatıldı. "${AUTH_DIR}" klasörünü sil ve botu yeniden başlatıp yeni QR okut.`,
        )
        return
      }

      const delay = Math.min(2 ** reconnectAttempts * 1000, MAX_BACKOFF_MS)
      reconnectAttempts += 1
      logger.warn({ statusCode, delay }, 'Bağlantı koptu, yeniden bağlanılacak')

      setTimeout(() => {
        connect().catch((err) => logger.error({ err }, 'Yeniden bağlanma başarısız'))
      }, delay)
    }
  })

  sock.ev.on('messages.upsert', async (event) => {
    // 'notify' = başkasından gelen yeni mesaj. 'append' = bu hesabın KENDİ
    // cihazından gönderilen mesaj; bot sahibi kendi telefonundan komut
    // yazdığında olay bu tiple düşer, atılırsa hiçbir komut çalışmaz.
    // (Geçmiş senkronu upsert'ten değil 'messaging-history.set'ten gelir.)
    if (event.type !== 'notify' && event.type !== 'append') return

    for (const msg of event.messages) {
      // Şifresi çözülemeyen mesaj içeriksiz gelir (Signal oturumu bozuksa
      // olur); komut çıkarılacak bir gövde yok.
      if (!msg.message) continue

      if (ageSeconds(msg.messageTimestamp) > MAX_MESSAGE_AGE_SEC) continue

      // Tek bir bozuk mesaj tüm botu düşürmemeli.
      try {
        await handleMessage({ sock, msg, commands })
      } catch (err) {
        logger.error({ err }, 'Mesaj işlenirken beklenmeyen hata')
      }
    }
  })

  return sock
}

async function main() {
  commands = await loadCommands()
  logger.info(`${new Set(commands.values()).size} komut yüklendi`)
  await connect()
}

main().catch((err) => {
  logger.error({ err }, 'Bot başlatılamadı')
  process.exit(1)
})
