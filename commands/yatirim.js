import { requireGroup } from '../lib/group.js'
import { miktarCoz } from '../lib/kumar.js'
import { piyasaOlayi } from '../lib/olay.js'
import { binlik } from '../lib/sayi.js'
import { getStats, RISKLER, yatirimTopla, yatirimYap } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import { MIN_YATIRIM, riskCoz, YATIRIM_SAATI } from '../lib/yatirim.js'
import { sureYaz } from './cark.js'
import logger from '../lib/logger.js'

const KAPALI = '📊 Yatırım şu an kapalı, sonra dene.'

function riskSatiri(risk) {
  return RISKLER[risk].sonuclar.map(([y, a]) => `%${a} ihtimalle ×${(y / 100).toLocaleString('tr-TR')}`).join(', ')
}

export default {
  name: 'yatırım',
  aliases: ['yatirim', 'invest'],
  description: `XP'ni ${YATIRIM_SAATI} saatliğine yatır, risk seç, kazan ya da kaybet`,
  usage: '.yatırım <miktar> <düşük|orta|yüksek>  —  .yatırım',
  details: [
    `Para ${YATIRIM_SAATI} saat kilitlenir, sonra \`.yatırım\` yazınca sonuç açıklanır ve para cüzdana gelir.`,
    `🟢 Düşük: ${riskSatiri('dusuk')}.`,
    `🟡 Orta: ${riskSatiri('orta')}.`,
    `🔴 Yüksek: ${riskSatiri('yuksek')}.`,
    'Sonuç yatırdığın an belirlenir; piyasa patlamasında kâr büyür, krizde küçülür (`.piyasa`).',
    `En az ${binlik(MIN_YATIRIM)} XP, aynı anda tek yatırım. Borçluyken yatırım yapılmaz.`,
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const kisi = { chatJid: from, userJid: sender }
      const now = Date.now()

      if (!args.length) {
        const s = yatirimTopla({ ...kisi, now })
        if (!s) return await yaz(KAPALI)
        if (s.yok) return await yaz('📊 Açık yatırımın yok. Kullanım: `.yatırım <miktar> <düşük|orta|yüksek>`')
        if (s.bekle) {
          return await yaz(`📊 ${RISKLER[s.risk].ad} yatırımın: ${binlik(s.miktar)} XP\n⏳ Sonuca ${sureYaz(s.bekle - now)} var.`)
        }
        const fark = s.odeme - s.miktar
        return await yaz([
          `📊 ${RISKLER[s.risk].ad} yatırımın sonuçlandı: ×${(s.carpan / 100).toLocaleString('tr-TR')}`,
          `${fark >= 0 ? '📈 Kâr' : '📉 Zarar'}: ${binlik(Math.abs(fark))} XP`,
          `💰 Gelen: ${binlik(s.odeme)} XP  •  👛 Cüzdan: ${binlik(s.xp)} XP`,
        ].join('\n'))
      }

      const risk = riskCoz(trLower(args[1] || ''))
      if (!risk) return await yaz('📊 Kullanım: `.yatırım <miktar> <düşük|orta|yüksek>`')
      const cozum = miktarCoz(args[0], getStats(from, sender).xp)
      if (cozum.hata) return await yaz(`📊 ${cozum.hata}`)
      const { miktar } = cozum
      if (miktar < MIN_YATIRIM) return await yaz(`📊 En az ${binlik(MIN_YATIRIM)} XP yatırılır.`)

      const s = yatirimYap({ ...kisi, miktar, risk, now })
      if (!s) return await yaz(KAPALI)
      if (s.acik) return await yaz(`📊 Zaten açık yatırımın var, sonuca ${sureYaz(s.acik.bitis - now)} kaldı.`)
      if (s.borclu) return await yaz('📊 Borçluyken yatırım yapamazsın.')
      if (s.yetersiz) return await yaz(`📊 O kadar XP'n yok. XP'n: ${binlik(s.xp)}`)

      const olay = piyasaOlayi(from, now)
      return await yaz([
        `📊 ${binlik(miktar)} XP ${RISKLER[risk].ad} yatırıma girdi.`,
        `⏳ Sonuç ${YATIRIM_SAATI} saat sonra, \`.yatırım\` yaz.`,
        ...(olay.yatirim ? [`🌐 ${olay.ad} etkisi yatırıma işlendi.`] : []),
        `👛 Cüzdan: ${binlik(s.xp)} XP`,
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.yatırım başarısız')
      await yaz('📊 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.yatırım hata mesajı gönderilemedi'),
      )
    }
  },
}
