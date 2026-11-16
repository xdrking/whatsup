// Reborn oylaması: sahip özelden başlatır, grupta herkes etiketlenir, reborn anlatılır, yanıtla evet/hayır.
// Oyun yuvasını (gameManager) tutmaz, `.oyunbitir` durduramaz (darbe gibi). Durum yalnızca bellektedir:
// bot oylama sürerken yeniden başlarsa oylama düşer, hiçbir şey sıfırlanmaz.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { getDb } from '../lib/db.js'
import { REBORN_SANS_MS, REBORN_SURE_MS, rebornKabul, rebornOyu, YILDIZ_ADEDI } from '../lib/reborn.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, rebornYap } from '../lib/stats.js'
import { displayName, mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'
import { endGame } from './gameManager.js'

const YEDEK_KLASORU = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'yedek')

// Özel mesajlar arasında beklenir: kısa sürede çok kişiye yazmak numarayı ban riskine sokar (darbe gibi).
const DM_ARASI_MS = 3000

const oylamalar = new Map()

export const rebornSuruyor = (chatJid) => oylamalar.has(chatJid)

const bekle = (ms) => new Promise((r) => setTimeout(r, ms))

/** Numarası bilinen üyeye numarasından yazılır: LID'e özel mesaj her zaman ulaşmıyor (bkz. `.tabu`). */
function dmAdresi(uye) {
  return [uye.jid, uye.id].find((j) => j?.endsWith('@s.whatsapp.net')) ?? uye.id
}

/** Oylama iptal edilir ya da biterse kalan üyelere yazılmaz. */
async function ozeldenBildir({ sock, chatJid, state, hedefler, metin }) {
  for (const [i, uye] of hedefler.entries()) {
    if (i) await bekle(DM_ARASI_MS)
    if (oylamalar.get(chatJid) !== state) return
    try {
      await sock.sendMessage(dmAdresi(uye), { text: metin })
    } catch (err) {
      logger.warn({ err, uye: uye.id }, 'Reborn özel mesajı gönderilemedi')
    }
  }
}

/** Ad panel/yedek.js'in döndürme kalıbına uymaz, günlük yedeklerle birlikte silinmez. */
async function yedekAl() {
  mkdirSync(YEDEK_KLASORU, { recursive: true })
  const dosya = path.join(YEDEK_KLASORU, `reborn-oncesi-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  await getDb().backup(dosya)
  return dosya
}

const say = (state, oy) => state.uyeler.filter((j) => state.oylar.get(j) === oy).length

async function bitir(sock, chatJid) {
  const state = oylamalar.get(chatJid)
  if (!state) return
  oylamalar.delete(chatJid)

  const evet = say(state, 'evet')
  const hayir = say(state, 'hayir')
  const sayim = `✅ Evet: ${evet}  •  ❌ Hayır: ${hayir}  •  🤐 Oy vermeyen: ${state.uyeler.length - evet - hayir}`

  if (!rebornKabul(evet, hayir)) {
    await sock.sendMessage(chatJid, { text: ['♻️ *Reborn reddedildi*', '', sayim, '', 'Evet çoğunlukta değil, ekonomi olduğu gibi kaldı.'].join('\n') })
    return
  }

  // Yedek alınamazsa sıfırlama yapılmaz: geri dönüşü olmayan işlem yedeksiz başlamasın.
  try {
    logger.info({ chatJid, dosya: await yedekAl() }, 'Reborn öncesi yedek alındı')
  } catch (err) {
    logger.error({ err, chatJid }, 'Reborn öncesi yedek alınamadı')
    await sock.sendMessage(chatJid, { text: `♻️ Oylama kabul etti ama yedek alınamadı, reborn *yapılmadı*.\n${sayim}` })
    return
  }

  // Açık oyunun bahsi eski paradır; kapatılmazsa sonradan eski rakamla ödenirdi.
  endGame(chatJid)

  const s = rebornYap({ chatJid })
  if (!s) {
    await sock.sendMessage(chatJid, { text: '♻️ Reborn uygulanamadı, ekonomi olduğu gibi kaldı.' })
    return
  }

  const lines = [
    `♻️♻️ *REBORN GELDİ* — ${s.no}. devir bitti, yenisi başladı ♻️♻️`,
    '',
    sayim,
    '',
    `📉 Biten devrin son kuru: 1 coin = ${binlik(s.kur)} XP  •  piyasadaki para: ${binlik(s.arz)} XP`,
    '🧹 Cüzdanlar, bankalar, borçlar, coin, mülk, Suly, hisse, yatırım, meslekler ve hazine sıfırlandı.',
    '🛡️ Mesaj sayıları, rozetler, kartlar, evcil hayvanlar, evlilikler, makamlar, unvanlar, kumar karneleri ve şampiyonluklar yerinde.',
  ]
  if (s.zenginler.length) {
    lines.push('', '⭐ *Biten devrin zenginleri* (profillerinde kalıcı yıldız)')
    s.zenginler.forEach((z, i) => lines.push(`${i + 1}. ${displayName(z.user_jid)} — ${binlik(z.servet)} XP`))
  }
  lines.push(
    '',
    `🎰 Önümüzdeki ${Math.round(REBORN_SANS_MS / 3_600_000)} saat bazı kumar oyunlarında şans arttı. Hangileri olduğunu siz bulun.`,
    '🚀 Herkes sıfırdan: mesaj yaz, `.günlük` al, `.meslek seç` ile işe gir.',
  )
  await sock.sendMessage(chatJid, { text: lines.join('\n') })
}

/**
 * Oylamayı duyurur: herkesi etiketler, reborn'un ne olduğunu anlatır.
 * @returns {Promise<boolean>} grup mesajı gönderilemezse ya da oylama zaten sürüyorsa false
 */
export async function rebornDuyur({ sock, chatJid, metadata, sahip }) {
  if (oylamalar.has(chatJid)) return false

  const katilimcilar = (metadata.participants || [])
    .filter((u) => ![u.id, u.jid, u.lid].some((j) => j && botHesabiMi(jidNormalizedUser(j))))
  const uyeler = katilimcilar.map((u) => jidNormalizedUser(u.id))
  const sure = Math.round(REBORN_SURE_MS / 60_000)

  const metin = [
    '♻️♻️ *REBORN OYLAMASI* ♻️♻️',
    '',
    `${mentionOf(sahip)} ekonomiyi sıfırdan başlatmayı oylamaya sunuyor.`,
    '',
    '❓ *Reborn nedir?*',
    'Para o kadar şişti ki rakamların anlamı kalmadı. Reborn herkesi aynı çizgiye çeker: ekonomi sıfırlanır, yeni bir devir başlar, herkes yeniden sıfırdan zengin olmaya çalışır.',
    '',
    '🧹 *Sıfırlananlar*',
    'Cüzdan (XP ve seviye), banka, kredi ve tefeci borçları, coin, mülk, Suly, hisse, yatırım, çete kasası, piyango biletleri, başa konan ödüller, meslekler, hapis ve hazine.',
    '',
    '🛡️ *Kalanlar*',
    'Mesaj, sticker ve ses sayıları, rozetler, kartlar, evcil hayvan, evlilik, makamlar, unvan, kumar karnesi, şampiyonluklar ve çeteler.',
    '',
    `⭐ O anki en zengin ${YILDIZ_ADEDI} kişi profilinde kalıcı yıldız taşır.`,
    '🎰 Reborn gelirse bazı kumar oyunlarında şans bir süreliğine artar. Hangileri olduğu söylenmeyecek.',
    '📉 İlk günlerde piyasada para olmayacağı için oyun ödülleri de küçük başlar, ekonomiyle birlikte büyür.',
    '',
    `↩️ Bu mesaja *evet* ya da *hayır* yazarak yanıt ver. ⏱️ ${sure} dakika. Evet oyları hayırdan fazlaysa reborn gelir.`,
    '',
    ...uyeler.map((j) => `• ${mentionOf(j)}`),
  ].join('\n')

  const gonderilen = await sock.sendMessage(chatJid, { text: metin, mentions: [...new Set([sahip, ...uyeler])] })
  const mesajId = gonderilen?.key?.id
  if (!mesajId) return false

  const state = { uyeler, mesajId, oylar: new Map(), timer: null }
  state.timer = setTimeout(() => {
    bitir(sock, chatJid).catch((err) => logger.error({ err, chatJid }, 'Reborn sonucu işlenemedi'))
  }, REBORN_SURE_MS)
  state.timer.unref?.()
  oylamalar.set(chatJid, state)

  const dm = [
    '♻️ *REBORN OYLAMASI*',
    '',
    `*${metadata.subject || 'Grup'}* grubunda ekonomiyi sıfırdan başlatmak oylanıyor.`,
    '',
    'Kabul edilirse cüzdan, banka, borçlar, coin, mülk, Suly, hisse, yatırım ve meslekler sıfırlanır; mesaj sayıları, rozetler, kartlar, evcil hayvan, evlilik, makamlar ve unvan kalır.',
    '',
    `Gruptaki oylama mesajına *evet* ya da *hayır* yazarak yanıt ver. ⏱️ ${sure} dakikan var. Buraya yazılan oy sayılmaz.`,
  ].join('\n')
  // Oylamayı başlatan zaten biliyor, ona yazılmaz.
  const hedefler = katilimcilar.filter((u) => jidNormalizedUser(u.id) !== sahip)
  ozeldenBildir({ sock, chatJid, state, hedefler, metin: dm })
    .catch((err) => logger.error({ err, chatJid }, 'Reborn özel mesajları yarıda kaldı'))

  return true
}

/** Süren oylamayı sonuçsuz kapatır. @returns {boolean} oylama var mıydı */
export function rebornIptal(chatJid) {
  const state = oylamalar.get(chatJid)
  if (!state) return false
  clearTimeout(state.timer)
  oylamalar.delete(chatJid)
  return true
}

/**
 * Oylama mesajına verilen yanıtı işler. Oy değiştirilebilir, son yanıt geçerlidir.
 * @returns {Promise<boolean>} true ise mesaj tüketildi
 */
export async function rebornYaniti({ sock, msg, parsed }) {
  if (!parsed.isGroup) return false
  const state = oylamalar.get(parsed.from)
  if (!state || parsed.quoted?.key?.id !== state.mesajId) return false

  const body = parsed.body?.trim()
  const prefix = process.env.PREFIX || '.'
  if (!body || body.startsWith(prefix)) return false
  if (!state.uyeler.includes(parsed.sender)) return true

  const oy = rebornOyu(body)
  try {
    if (!oy) {
      await sock.sendMessage(parsed.from, { text: '♻️ *evet* ya da *hayır* yaz.' }, { quoted: msg })
      return true
    }
    state.oylar.set(parsed.sender, oy)
    await sock.sendMessage(parsed.from, { react: { text: oy === 'evet' ? '✅' : '❌', key: msg.key } })
  } catch (err) {
    logger.error({ err, chatJid: parsed.from }, 'Reborn yanıtı işlenemedi')
  }
  return true
}
