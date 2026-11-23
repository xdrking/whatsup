// Merkez Bankası soygunu: lobi yanıtla dolar, kuran başlatır. Kurallar lib/yeralti.js'te, para
// lib/stats.js:vurgunYap()'tadır. Lobide hiçbir şey harcanmaz; `.oyunbitir` ve zaman aşımı yalnızca lobiyi kapatır.
import { sureYaz } from '../commands/cark.js'
import { HAPIS_SAATI } from '../lib/hapis.js'
import logger from '../lib/logger.js'
import { binlik } from '../lib/sayi.js'
import { botGonderisi } from '../lib/sosyal.js'
import { vurgunYap } from '../lib/stats.js'
import { displayName, mentionOf } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { rolBul, rolKoduyla, ROLLER, VURGUN_EN_AZ, VURGUN_LOBI_MS } from '../lib/yeralti.js'
import { endGame, setLastMessage, startGame } from './gameManager.js'

const ekipListesi = (state) => ROLLER
  .map((r) => [r, state.ekip.find((u) => u.rol === r.kod)])
  .map(([r, u]) => `${r.ad}: ${u ? mentionOf(u.jid) : '—'}`)
  .join('\n')

function engelMetni({ engel, jid, bitis }) {
  const kim = jid ? mentionOf(jid) : ''
  const kalan = bitis ? sureYaz(bitis - Date.now()) : ''
  return {
    bekle: `🚓 Merkez Bankası polis kaynıyor, ${kalan} kaldı.`,
    'kasa-bos': '🏦 Kasa tam takır, soyacak bir şey yok.',
    hapis: `🚔 ${kim} hapiste (${kalan}). \`çık\` yazsın ya da beklesin.`,
    'hacker-yok': `💻 ${kim} hacker'sız gelmiş. \`.sulymarket\``,
    'cilingir-yok': `🗝️ ${kim} çilingir almamış. \`.sulymarket\``,
    'silah-yok': `🔫 ${kim} silahlı bir çetede değil. \`.sulymarket\``,
  }[engel]
}

async function sonuc(state, s, yaz) {
  if (s.basarili) {
    botGonderisi(state.chatJid, `🏦 Merkez Bankası soyuldu! Ekip ${binlik(s.toplam)} XP ile kaçtı: ${state.ekip.map((u) => displayName(u.jid)).join(', ')}`)
    return yaz([
      '🏦💥 *VURGUN BAŞARILI!*',
      `Şans %${s.sans} idi. Hazineden *${binlik(s.toplam)} XP* çıktı.`,
      '',
      ...state.ekip.map((u) => `${rolKoduyla(u.rol).ad} ${mentionOf(u.jid)}: +${binlik(s.pay)} XP`),
    ].join('\n'), state.ekip.map((u) => u.jid))
  }
  return yaz([
    '🚨 *VURGUN PATLADI!*',
    `Şans %${s.sans} idi, polis kapıda bekliyormuş.`,
    '',
    ...s.yakalananlar.map((y) => `🚔 ${mentionOf(y.jid)}: ${HAPIS_SAATI} saat hapis, kefalet ${binlik(y.kefalet)} XP`),
    ...s.kacanlar.map((jid) => `🛰️ ${mentionOf(jid)} VPN'iyle iz bırakmadan kaçtı`),
  ].join('\n'), state.ekip.map((u) => u.jid))
}

async function cevapAl({ sock, msg, parsed, state, body }) {
  if (state.finished) return
  const yaz = (text, mentions = []) => sock.sendMessage(state.chatJid, { text, mentions }, { quoted: msg })
  const jidler = () => state.ekip.map((u) => u.jid)
  const metin = trLower(body.trim())
  const ben = state.ekip.find((u) => u.jid === parsed.sender)

  if (['çık', 'cik', 'kaç', 'kac'].includes(metin)) {
    if (!ben) return
    state.ekip = state.ekip.filter((u) => u !== ben)
    return yaz(`🚪 ${mentionOf(parsed.sender)} ekipten çıktı.\n\n${ekipListesi(state)}`, [parsed.sender, ...jidler()])
  }

  if (['başla', 'basla', 'başlat', 'baslat'].includes(metin)) {
    if (parsed.sender !== state.starterJid) return yaz('🏦 Vurgunu yalnızca kuran başlatır.')
    if (state.ekip.length < VURGUN_EN_AZ) return yaz(`🏦 En az ${VURGUN_EN_AZ} kişi gerekiyor, şu an ${state.ekip.length}.`)
    const s = vurgunYap({ chatJid: state.chatJid, ekip: state.ekip })
    if (!s) return yaz('🏦 Plan suya düştü, sonra dene.')
    if (s.engel) return yaz(engelMetni(s), s.jid ? [s.jid] : [])
    state.finished = true
    endGame(state.chatJid)
    return sonuc(state, s, yaz)
  }

  const rol = rolBul(metin)
  if (!rol) return yaz(`🏦 Rolünü yaz: ${ROLLER.map((r) => `\`${r.adlar[0]}\``).join(', ')}. Çıkmak için \`çık\`.`)
  if (state.ekip.some((u) => u.rol === rol.kod && u !== ben)) return yaz(`${rol.ad} dolu.`)
  // setLastMessage çağrılmaz: herkes baştaki lobi mesajına yanıt vermeye devam etsin.
  state.ekip = [...state.ekip.filter((u) => u !== ben), { jid: parsed.sender, rol: rol.kod }]
  return yaz(ekipListesi(state), jidler())
}

/** `.vurgun` gövdesi; komut boş oyun yuvasını ve bekleme süresini denetlemiştir. */
export async function start({ sock, msg, from, sender }) {
  const iptal = { text: '🏦 Vurgun lobisi kapandı, ekip toplanamadı. Kimse bir şey harcamadı.' }
  const state = startGame(from, {
    type: 'vurgun',
    starterJid: sender,
    lastMessageId: null,
    timeoutMs: VURGUN_LOBI_MS,
    ekip: [],
    finished: false,
    onAnswer: cevapAl,
    summarize: () => iptal,
    onTimeout: async () => {
      if (!state.finished) await sock.sendMessage(from, iptal)
    },
  })
  if (!state) return sock.sendMessage(from, { text: '⚠️ Bu grupta zaten aktif bir oyun var.' }, { quoted: msg })

  const result = await sock.sendMessage(from, {
    text: [
      '🏦 *MERKEZ BANKASI VURGUNU*',
      `${mentionOf(sender)} ekip topluyor! En az ${VURGUN_EN_AZ} kişi.`,
      '',
      ...ROLLER.map((r) => `${r.ad} — ${r.not}`),
      '',
      `↩️ Bu mesaja rolünü yanıtla: ${ROLLER.map((r) => r.adlar[0]).join(', ')}`,
      `Kuran da rol seçer, sonra \`başla\` yazar. ${VURGUN_LOBI_MS / 60_000} dk sonra lobi kapanır.`,
    ].join('\n'),
    mentions: [sender],
  }, { quoted: msg })

  const id = result?.key?.id
  if (!id) {
    logger.error({ from }, 'Oyun mesajının id\'si alınamadı, vurgun iptal edildi')
    endGame(from)
    return
  }
  setLastMessage(from, id)
}
