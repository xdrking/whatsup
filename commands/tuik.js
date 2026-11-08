import { bozdurmaDegeri } from '../lib/coin.js'
import { piyasaOlayi } from '../lib/olay.js'
import { requireGroup } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { ekonomiDurumu } from '../lib/stats.js'
import { mentionOf } from '../lib/target.js'
import logger from '../lib/logger.js'

const yuzde = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

function enflasyon(simdi, onceki) {
  return onceki?.arz ? ((simdi - onceki.arz) / onceki.arz) * 100 : null
}

// Bozdurma, anlık kurun bu oranının altındaysa uyarı çıkar: gün açılış kuru geride kalmıştır.
const BOZDURMA_UYARI_ORANI = 0.8

/**
 * Bültenin açıklama satırları. Enflasyon gün açılışındaki kayıttan hesaplandığı için gün
 * içindeki değişim ayrıca yazılır; yoksa düşen para "enflasyon düşmüyor" diye okunuyordu.
 */
export function uyariSatirlari(e) {
  const lines = []
  if (e.arz) {
    const degisim = enflasyon(e.anlik, { arz: e.arz })
    lines.push(`⏱️ Bugün açılıştan beri: ${degisim > 0 ? '+' : degisim < 0 ? '−' : ''}%${yuzde.format(Math.abs(degisim))} (anlık)`)
  }
  if (e.bozdurmaKur < e.kur * BOZDURMA_UYARI_ORANI) {
    lines.push(
      `⚠️ Bugün coin bozdurmayın: bozdurma ${binlik(bozdurmaDegeri(1, e.bozdurmaKur))} XP, gün açılış kuruna bağlı ve düşük kaldı.`
        + ' Yarın ilk mesajla güncellenir.',
    )
  }
  return lines
}

function satir(etiket, oran) {
  if (oran === null) return `${etiket}: veri birikiyor`
  return `${etiket}: %${yuzde.format(oran)} (resmi: %${yuzde.format(oran / 2)})`
}

export default {
  name: 'tüik',
  aliases: ['tuik', 'enflasyon'],
  description: 'Gruptaki para, enflasyon, coin kuru ve en zenginler',
  usage: '.tüik',
  details: [
    'Para, üyelerin cüzdan ve bankasıdır, bot hariçtir. Kasa botun cüzdanı ve bankasıdır. Enflasyon günlük kayıtlardan hesaplanır.',
    'Günlük ve haftalık enflasyon günün ilk mesajındaki kayda göredir, gün içinde değişmez. Gün içindeki değişimi "Bugün açılıştan beri" satırı gösterir.',
    '"Resmi" oran şakadır, gerçeğin yarısıdır.',
  ],
  category: 'ekonomi',
  cooldown: 10,
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const e = ekonomiDurumu({ chatJid: from })
      if (!e) return await yaz('📊 Kurum şu an kapalı, sonra dene.')

      await yaz(
        [
          '📊 *TÜİK Ekonomi Bülteni*',
          '',
          `💰 Piyasadaki para: ${binlik(e.anlik)} XP`,
          `🪙 Anlık coin kuru: ${binlik(e.kur)} XP`,
          `🌐 Piyasa olayı: ${piyasaOlayi(from, Date.now()).ad}`,
          `🏦 Merkez bankası kasası: ${binlik(e.kasa)} XP`,
          `💳 Açık kredi: ${binlik(e.kredi.toplam)} XP (${e.kredi.adet} kişi)`,
          `💼 Bugün ödenen maaş: ${binlik(e.maas)} XP`,
          satir('📈 Günlük enflasyon (dün → bugün açılış)', enflasyon(e.arz, e.dun)),
          satir('📅 Haftalık enflasyon (açılışa göre)', enflasyon(e.arz, e.hafta)),
          ...uyariSatirlari(e),
          '',
          '🏆 *En zenginler*',
          ...e.zenginler.map((z, i) => `${i + 1}. ${mentionOf(z.user_jid)} — ${binlik(z.servet)} XP`),
        ].join('\n'),
        e.zenginler.map((z) => z.user_jid),
      )
    } catch (err) {
      logger.error({ err, from }, '.tüik başarısız')
      await yaz('📊 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.tüik hata mesajı gönderilemedi'),
      )
    }
  },
}
