import { sureYaz } from './cark.js'
import { BOZDURMA_YUZDESI, bozdurmaDegeri, COIN_TABAN, COIN_URUNLERI } from '../lib/coin.js'
import { requireGroup } from '../lib/group.js'
import { binlik, xpButcesi } from '../lib/sayi.js'
import { coinAl, coinDurumu, coinMarketAl, coinSat, ekonomiDurumu, getStats, sigortaBitisi } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import { HAFTALIK_ALIM, KASALAR } from '../lib/sandik.js'
import { sandikSatinAl } from './kasa.js'
import logger from '../lib/logger.js'

export default {
  name: 'coinmarket',
  aliases: ['cm', 'coinmarketi'],
  description: 'XP ile coin al, coinle özel ürünler satın al',
  usage: '.coinmarket  —  .coinmarket coin <adet|XP xp|hepsi>  —  .coinmarket sat <adet>  —  .coinmarket al <numara>  —  .coinmarket kasa|anahtar <1-5> [adet]',
  details: [
    `Kur piyasadaki paraya göre anlık değişir, en az ${binlik(COIN_TABAN)} XP. \`.coinmarket coin 2\` cüzdandaki XP ile 2 coin alır.`,
    '`.coinmarket coin 1 milyar xp` 1 milyar XP\'nin aldığı kadar coin alır, `.coinmarket coin hepsi` bütün cüzdanla. Coin küsuratlı olmaz: artan XP cüzdanda kalır.',
    `\`.coinmarket sat 2\` coini kurun %${BOZDURMA_YUZDESI}'ine bozdurur. Kur gün içinde çıktıysa bozdurma günün ilk kuruyla yapılır. Ödenen XP yanar. Açık kredin varken coin alamazsın.`,
    '`.coinmarket al 1` ürünü coinle alır. Unvan `.market` unvanının yerine geçer.',
    'Toplu soygun hakkı `.soygun herkes` ile kullanılır. Coin her grupta ayrıdır.',
    'Toplu haciz `.hacizall` ile kullanılır, coin o an düşer.',
    `\`.coinmarket kasa 3\` T3 kasa, \`.coinmarket anahtar 3 2\` iki T3 anahtar alır. Kasa haftada en çok ${HAFTALIK_ALIM}, anahtar sınırsız. Açmak için \`.kasa aç 3\`.`,
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const islem = trLower(args[0] || '')

      if (islem === 'coin') {
        const KULLANIM = '🪙 Kaç coin? `.coinmarket coin 2` ya da XP ile: `.coinmarket coin 1 milyar xp`'
        const butce = xpButcesi(args.slice(1), getStats(from, sender).xp)
        if (butce?.hata) return await yaz(KULLANIM)
        const adet = Number(args[1])
        if (!butce && (!Number.isSafeInteger(adet) || adet < 1)) return await yaz(KULLANIM)

        const s = coinAl({ chatJid: from, userJid: sender, ...(butce ? { xpButce: butce.butce } : { adet }) })
        if (!s) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
        if (s.kredili) return await yaz('🪙 Açık kredin varken coin alamazsın. Önce `.kredi öde`.')
        if (s.azXp) return await yaz(`🪙 O para 1 coine yetmiyor. 1 coin = ${binlik(s.kur)} XP`)
        if (s.yetersiz) return await yaz(`🪙 ${binlik(s.ucret)} XP gerekiyor. Senin XP'n: ${binlik(s.xp)}`)
        return await yaz(`🪙 *${binlik(s.adet)} coin* aldın, ${binlik(s.ucret)} XP ödedin.\n💰 Coin: ${binlik(s.bakiye)}  •  XP'n: ${binlik(s.xp)}`)
      }

      if (['sat', 'boz', 'bozdur'].includes(islem)) {
        const adet = Number(args[1])
        if (!Number.isSafeInteger(adet) || adet < 1) return await yaz('🪙 Kaç coin? `.coinmarket sat 2`')

        const s = coinSat({ chatJid: from, userJid: sender, adet })
        if (!s) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
        if (s.yetersiz) return await yaz(`🪙 O kadar coinin yok: ${binlik(s.bakiye)}`)
        return await yaz(`🪙 *${binlik(adet)} coin* bozdurdun: +${binlik(s.kazanc)} XP\n💰 Coin: ${binlik(s.bakiye)}  •  XP'n: ${binlik(s.xp)}`)
      }

      if (islem === 'kasa' || islem === 'anahtar') {
        return await sandikSatinAl({ from, sender, tur: islem, args: args.slice(1), yaz })
      }

      if (['al', 'satınal', 'satinal', 'buy'].includes(islem)) {
        const urun = COIN_URUNLERI[Number(args[1]) - 1]
        if (!urun) return await yaz(`🪙 Ürün numarası yaz: \`.coinmarket al 1\` (1-${COIN_URUNLERI.length})`)

        if (urun.topluHaciz) return await yaz(`⚖️ Bu ürün satın alınmaz, \`.hacizall\` yazınca ${urun.fiyat} coin düşer ve hemen işler.`)

        const s = coinMarketAl({ chatJid: from, userJid: sender, urun })
        if (!s) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
        if (s.zatenVar) return await yaz('🪙 Bu unvan zaten sende.')
        if (s.yetersiz) return await yaz(`🪙 ${urun.fiyat} coin gerekiyor. Senin coinin: ${binlik(s.bakiye)}`)
        return await yaz(`🪙 *${urun.ad}* satın alındı.\n💰 Kalan coin: ${binlik(s.bakiye)}`)
      }

      const { bakiye, topluHak } = coinDurumu(from, sender)
      const ekonomi = ekonomiDurumu({ chatJid: from })
      if (!ekonomi) return await yaz('🪙 Coin market şu an kapalı, sonra dene.')
      const sigorta = sigortaBitisi(from, sender)
      await yaz([
        '🪙 *Coin Market*',
        `Alış: 1 coin = ${binlik(ekonomi.alisKur)} XP  •  Bozdurma: ${binlik(bozdurmaDegeri(1, ekonomi.bozdurmaKur))} XP`,
        '',
        ...COIN_URUNLERI.map((u, i) => `${i + 1}. ${u.ad} — ${u.fiyat} coin`),
        '',
        '🎁 *Kasalar* (kasa / anahtar)',
        ...KASALAR.map((k) => `T${k.tier} ${k.ad} — ${k.fiyat} / ${k.anahtar} coin`),
        '',
        `💰 Coin: ${binlik(bakiye)}  •  XP'n: ${binlik(getStats(from, sender).xp)}`,
        ...(topluHak ? [`💣 Toplu soygun hakkın: ${topluHak}`] : []),
        ...(sigorta ? [`☂️ Haciz sigortası: ${sureYaz(sigorta - Date.now())} kaldı`] : []),
        '',
        'Coin almak için `.coinmarket coin <adet>` ya da `.coinmarket coin 1 milyar xp`',
        'Bozdurmak için `.coinmarket sat <adet>`',
        'Ürün almak için `.coinmarket al <numara>`',
        'Kasa için `.coinmarket kasa 3`, anahtar için `.coinmarket anahtar 3`, açmak için `.kasa aç 3`',
        'Mülkler için `.mülk`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.coinmarket başarısız')
      await yaz('🪙 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.coinmarket hata mesajı gönderilemedi'),
      )
    }
  },
}
