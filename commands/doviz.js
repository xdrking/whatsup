import logger from '../lib/logger.js'
import { getJson } from '../lib/http.js'

// Frankfurter: Avrupa Merkez Bankası'nın günlük referans kurları, API key yok.
// Anlık piyasa kuru değildir; iş günlerinde bir kez güncellenir.
const KUR_URL = 'https://api.frankfurter.app/latest'

const PARALAR = {
  USD: { ad: 'Dolar', bayrak: '🇺🇸' },
  EUR: { ad: 'Euro', bayrak: '🇪🇺' },
  GBP: { ad: 'Sterlin', bayrak: '🇬🇧' },
  CHF: { ad: 'İsviçre frangı', bayrak: '🇨🇭' },
  JPY: { ad: 'Japon yeni', bayrak: '🇯🇵' },
}

// ".döviz 100 dolar" gibi Türkçe yazımlar da çalışsın.
const ESANLAM = {
  dolar: 'USD', usd: 'USD', euro: 'EUR', avro: 'EUR', eur: 'EUR',
  sterlin: 'GBP', pound: 'GBP', gbp: 'GBP', frank: 'CHF', chf: 'CHF', yen: 'JPY', jpy: 'JPY',
}

const tl = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

/** Her para birimi için 1 birimin TL karşılığı. Kurlar EUR tabanlı gelir, TL'ye çevrilir. */
async function tlKurlari() {
  const kodlar = Object.keys(PARALAR).filter((k) => k !== 'EUR')
  const { date, rates } = await getJson(`${KUR_URL}?from=EUR&to=TRY,${kodlar.join(',')}`)

  const kurlar = { EUR: rates.TRY }
  for (const kod of kodlar) kurlar[kod] = rates.TRY / rates[kod]

  return { tarih: date, kurlar }
}

export default {
  name: 'döviz',
  aliases: ['doviz', 'kur', 'dolar', 'euro'],
  description: 'Dolar, euro, sterlin… TL karşılığı; tutar verirsen çevirir',
  usage: '.döviz  —  .döviz 100 dolar',
  details: [
    '`.döviz` → başlıca para birimlerinin TL karşılığı.',
    '`.döviz 100 dolar`  •  `.döviz 50 euro`  •  `.döviz 20 sterlin` → TL\'ye çevirir.',
    'Kurlar Avrupa Merkez Bankası\'nın günlük referans kurudur; anlık piyasa kuru değildir.',
  ],
  category: 'araç',
  ownerOnly: false,
  // Dış servis: hız sınırına takılmayalım.
  cooldown: 10,

  async execute({ sock, msg, from, args }) {
    const tutar = Number.parseFloat((args[0] || '').replace(',', '.'))
    const kod = ESANLAM[(args[1] || '').toLocaleLowerCase('tr')]

    if (args.length && (!Number.isFinite(tutar) || tutar <= 0 || !kod)) {
      await sock.sendMessage(
        from,
        { text: '💱 Kullanım: `.döviz` ya da `.döviz 100 dolar` (dolar, euro, sterlin, frank, yen)' },
        { quoted: msg },
      )
      return
    }

    let veri
    try {
      veri = await tlKurlari()
    } catch (err) {
      logger.error({ err }, 'Döviz kurları alınamadı')
      await sock.sendMessage(from, { text: '💱 Kur servisi şu an cevap vermiyor.' }, { quoted: msg })
      return
    }

    const kaynak = `_${veri.tarih} tarihli ECB kuru_`

    if (kod) {
      const p = PARALAR[kod]
      await sock.sendMessage(
        from,
        { text: `💱 ${p.bayrak} ${tl.format(tutar)} ${kod} = *${tl.format(tutar * veri.kurlar[kod])} TL*\n${kaynak}` },
        { quoted: msg },
      )
      return
    }

    const satirlar = Object.entries(PARALAR).map(
      ([k, p]) => `${p.bayrak} ${p.ad}: *${tl.format(veri.kurlar[k])} TL*`,
    )

    await sock.sendMessage(
      from,
      { text: ['💱 *Döviz kurları*', '', ...satirlar, '', kaynak].join('\n') },
      { quoted: msg },
    )
  },
}
