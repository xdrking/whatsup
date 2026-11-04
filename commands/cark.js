import { requireGroup } from '../lib/group.js'
import { carkCevir, EKSTRA_UCRET, ODULLER, UCRETSIZ_HAK } from '../lib/cark.js'
import { carkDurumu, carkOyna, seviye } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const EKSTRA_KELIMELERI = new Set(['ekstra', 'extra', 'al', 'satınal', 'satinal'])
const DURUM_KELIMELERI = new Set(['durum', 'hak', 'kalan'])

/** 3_660_000 → "1 sa 1 dk"; bir dakikanın altı da "1 dk" görünür. */
export function sureYaz(ms) {
  const dakika = Math.max(1, Math.ceil(ms / 60_000))
  const saat = Math.floor(dakika / 60)
  return saat ? `${saat} sa ${dakika % 60} dk` : `${dakika} dk`
}

function bonusSatiri(bonus, now) {
  return `🚀 Aktif bonus: oyunlardan ${(100 + bonus.yuzde) / 100} kat XP (${sureYaz(bonus.bitis - now)} kaldı)`
}

function hakSatiri({ kalan, yenilenme }, now) {
  const satir = `🎟️ Kalan hak: ${kalan}`
  return yenilenme ? `${satir} (yenilenmesine ${sureYaz(yenilenme - now)})` : satir
}

export default {
  name: 'çark',
  aliases: ['cark', 'wheel', 'spin'],
  description: 'Şans çarkı: XP ya da 1 saatlik oyun XP bonusu kazandırır',
  usage: '.çark  —  .çark ekstra  —  .çark durum',
  details: [
    `24 saatte ${UCRETSIZ_HAK} ücretsiz hakkın var; süre o turdaki ilk çevirmenle başlar.`,
    `Hakkın bitince \`.çark ekstra\` ${EKSTRA_UCRET} XP karşılığında bir kez daha çevirir.`,
    '`.çark durum` kalan hakkını ve aktif bonusunu gösterir.',
    `Ödüller: ${ODULLER.map((o) => o.etiket).join(', ')}.`,
    'Bonus yalnızca oyun XP\'sine işler (.kelime, .kimim, .quiz, .düello, .emoji, .adamasmaca).',
    'Bonus varken yenisi çıkarsa güçlü olan kalır, süre 1 saate döner. Hak ve bonus her grupta ayrıdır.',
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const secim = trLower(args[0] || '')
      const kisi = { chatJid: from, userJid: sender }
      const now = Date.now()

      if (DURUM_KELIMELERI.has(secim)) {
        const durum = carkDurumu(kisi)
        if (!durum) return await yaz('🎡 Çark şu an kapalı, sonra dene.')

        const lines = [hakSatiri(durum, now)]
        if (durum.bonus) lines.push(bonusSatiri(durum.bonus, now))
        return await yaz(lines.join('\n'))
      }

      // Yanlış yazım XP harcatmasın ya da hak yakmasın.
      if (secim && !EKSTRA_KELIMELERI.has(secim)) {
        return await yaz('🎡 Kullanım: `.çark`, `.çark ekstra` ya da `.çark durum`')
      }

      const s = carkOyna({ ...kisi, ekstra: Boolean(secim), cevir: carkCevir, now })
      if (!s) return await yaz('🎡 Çark şu an kapalı, sonra dene.')

      if (s.hakYok) {
        return await yaz([
          `🎡 Ücretsiz hakkın bitti. Yenilenmesine ${sureYaz(s.yenilenme - now)} var.`,
          `💸 Beklemek istemezsen \`.çark ekstra\` (${EKSTRA_UCRET} XP).`,
        ].join('\n'))
      }
      if (s.yetersiz) return await yaz(`🎡 Ekstra çevirme ${EKSTRA_UCRET} XP. Senin XP'n: ${s.xp}`)

      const lines = ['🎡 Çark döndü…', `*${s.odul.etiket}*`, '']
      if (s.ucret) lines.push(`💸 Ücret: ${s.ucret} XP`)
      if (s.xp !== s.once) lines.push(`💰 XP: ${s.once} → ${s.xp}`)
      if (s.bonus) lines.push(bonusSatiri(s.bonus, now))
      lines.push(hakSatiri(s, now))

      const yeni = seviye(s.xp)
      if (yeni > seviye(s.once)) lines.push(`🆙 Seviye ${yeni} oldun!`)

      await yaz(lines.join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.çark başarısız')
      await yaz('🎡 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.çark hata mesajı gönderilemedi'),
      )
    }
  },
}
