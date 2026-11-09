// Darbe akışı: grup duyurusu, üyelere özel mesaj, yanıtla destek/karşı, 10 dk sonra sonuç.
// Oyun yuvasını (gameManager) tutmaz: darbe oyunları kilitlemesin ve `.oyunbitir` ile durdurulamasın.
// Durum yalnızca bellektedir; bot yeniden başlarsa yönetim yine sahipte kalır, ceza ve ödül işlenmez.
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { DARBE_SURE_MS, DARBE_YUZDE, darbeOyu } from '../lib/devlet.js'
import { MULKLER } from '../lib/mulk.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, darbeSonuc } from '../lib/stats.js'
import { displayName, mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

// Özel mesajlar arasında beklenir: kısa sürede çok kişiye yazmak numarayı ban riskine sokar.
const DM_ARASI_MS = 3000

const darbeler = new Map()

export const darbeSuruyor = (chatJid) => darbeler.has(chatJid)

const bekle = (ms) => new Promise((r) => setTimeout(r, ms))

function tehdit(odul) {
  return [
    `✅ Destek verenlere hazineden *${binlik(odul)} XP* ödül verilecektir.`,
    `❌ Destek vermeyenlerin banka ve cüzdanlarının %${DARBE_YUZDE.banka}'ına, coinlerinin %${DARBE_YUZDE.coin}'ına ve mülklerinin yarısına el konulacaktır.`,
  ]
}

/** Numarası bilinen üyeye numarasından yazılır: LID'e özel mesaj her zaman ulaşmıyor (bkz. `.tabu`). */
function dmAdresi(uye) {
  return [uye.jid, uye.id].find((j) => j?.endsWith('@s.whatsapp.net')) ?? uye.id
}

async function ozeldenBildir({ sock, hedefler, metin }) {
  for (const [i, uye] of hedefler.entries()) {
    if (i) await bekle(DM_ARASI_MS)
    try {
      await sock.sendMessage(dmAdresi(uye), { text: metin })
    } catch (err) {
      logger.warn({ err, uye: uye.id }, 'Darbe özel mesajı gönderilemedi')
    }
  }
}

function cezaSatiri(c) {
  const parcalar = []
  if (c.banka) parcalar.push(`banka ${binlik(c.banka)}`)
  if (c.cuzdan) parcalar.push(`cüzdan ${binlik(c.cuzdan)}`)
  if (c.coin) parcalar.push(`${c.coin} coin`)
  for (const m of c.mulkler) parcalar.push(`${m.adet} ${MULKLER.find((x) => x.kod === m.kod)?.ad ?? m.kod}`)
  return `• ${displayName(c.jid)}: ${parcalar.length ? parcalar.join(', ') : 'el konacak bir şeyi yoktu'}`
}

async function bitir(sock, chatJid) {
  const state = darbeler.get(chatJid)
  if (!state) return
  darbeler.delete(chatJid)

  const destekciler = state.uyeler.filter((j) => state.oylar.get(j) === 'destek')
  const muhalifler = state.uyeler.filter((j) => state.oylar.get(j) !== 'destek')
  const karsi = muhalifler.filter((j) => state.oylar.get(j) === 'karsi').length
  const s = darbeSonuc({ chatJid, destekciler, muhalifler, odul: state.odul })
  if (!s) {
    await sock.sendMessage(chatJid, { text: '🪖 Darbe sonucu işlenemedi. Yönetim yine de el değiştirdi.' })
    return
  }

  const cogunluk = destekciler.length > muhalifler.length
  const lines = [
    '🪖 *DARBE TAMAMLANDI*',
    '',
    `🏛️ Yönetim artık ${displayName(state.sahip)} elinde. ${cogunluk ? 'Halk darbeyi destekledi.' : 'Halk desteklemese de yönetim el değiştirdi.'}`,
    '',
    `✅ Destek: ${destekciler.length} kişi${s.destek.length ? `, kişi başı ${binlik(s.destek[0].odul)} XP ödül` : ''}`,
    `❌ Karşı: ${karsi} kişi  •  🤐 Sessiz: ${muhalifler.length - karsi} kişi`,
  ]
  if (s.ceza.length) lines.push('', '⚖️ *El konulanlar*', ...s.ceza.map(cezaSatiri))
  await sock.sendMessage(chatJid, { text: lines.join('\n') })
}

/**
 * Darbeyi duyurur. Yönetim çağırmadan önce `darbeBaslat()` ile sahibe geçmiş olmalıdır.
 * @returns {Promise<boolean>} grup mesajı gönderilemezse false
 */
export async function darbeDuyur({ sock, chatJid, metadata, sahip, odul }) {
  if (darbeler.has(chatJid)) return false

  const katilimcilar = (metadata.participants || []).filter((u) => {
    const id = jidNormalizedUser(u.id)
    return id !== sahip && ![u.id, u.jid, u.lid].some((j) => j && botHesabiMi(jidNormalizedUser(j)))
  })
  const uyeler = katilimcilar.map((u) => jidNormalizedUser(u.id))
  const sure = Math.round(DARBE_SURE_MS / 60_000)

  const metin = [
    '🪖🪖🪖 *DARBE!* 🪖🪖🪖',
    '',
    `${mentionOf(sahip)} yönetime el koydu. Başkanlık seçimleri askıya alındı.`,
    '',
    ...tehdit(odul),
    '',
    `↩️ Bu mesaja *destek* ya da *karşı* yazarak yanıt ver. ⏱️ ${sure} dakikanız var.`,
    '',
    ...uyeler.map((j) => `• ${mentionOf(j)}`),
  ].join('\n')

  const gonderilen = await sock.sendMessage(chatJid, { text: metin, mentions: [sahip, ...uyeler] })
  const mesajId = gonderilen?.key?.id
  if (!mesajId) return false

  const state = { sahip, uyeler, odul, mesajId, oylar: new Map(), timer: null }
  state.timer = setTimeout(() => {
    bitir(sock, chatJid).catch((err) => logger.error({ err, chatJid }, 'Darbe sonucu gönderilemedi'))
  }, DARBE_SURE_MS)
  state.timer.unref?.()
  darbeler.set(chatJid, state)

  const dm = [
    '🪖 *DARBE BİLDİRİMİ*',
    '',
    `*${metadata.subject || 'Grup'}* grubunda yönetime ${displayName(sahip)} el koydu.`,
    '',
    ...tehdit(odul),
    '',
    `Gruptaki darbe mesajına *destek* ya da *karşı* yazarak yanıt ver. ⏱️ ${sure} dakikan var.`,
  ].join('\n')
  ozeldenBildir({ sock, hedefler: katilimcilar, metin: dm })
    .catch((err) => logger.error({ err, chatJid }, 'Darbe özel mesajları yarıda kaldı'))

  return true
}

/**
 * Darbe mesajına verilen yanıtı işler. Oy değiştirilebilir, son yanıt geçerlidir.
 * @returns {Promise<boolean>} true ise mesaj tüketildi
 */
export async function darbeYaniti({ sock, msg, parsed }) {
  if (!parsed.isGroup) return false
  const state = darbeler.get(parsed.from)
  if (!state || parsed.quoted?.key?.id !== state.mesajId) return false

  const body = parsed.body?.trim()
  const prefix = process.env.PREFIX || '.'
  if (!body || body.startsWith(prefix)) return false
  if (!state.uyeler.includes(parsed.sender)) return true

  const oy = darbeOyu(body)
  try {
    if (!oy) {
      await sock.sendMessage(parsed.from, { text: '🪖 *destek* ya da *karşı* yaz.' }, { quoted: msg })
      return true
    }
    state.oylar.set(parsed.sender, oy)
    await sock.sendMessage(parsed.from, { react: { text: oy === 'destek' ? '✅' : '❌', key: msg.key } })
  } catch (err) {
    logger.error({ err, chatJid: parsed.from }, 'Darbe yanıtı işlenemedi')
  }
  return true
}
