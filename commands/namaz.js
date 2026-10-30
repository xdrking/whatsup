import logger from '../lib/logger.js'
import { getJson } from '../lib/http.js'

// Aladhan: ücretsiz, API key yok. method=13 Diyanet İşleri Başkanlığı hesabıdır.
const VAKIT_URL = 'https://api.aladhan.com/v1/timingsByAddress'
const DIYANET = '13'

// Aladhan tarihi İngilizce verir ("31 Oct 2026"); gösterimde Türkçe kullanılır.
const tarihBicimi = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

// Diyanet'te imsak, sabah namazı vaktinin (Fajr) kendisidir. Aladhan'ın ayrıca
// verdiği "Imsak" alanı 10 dk ihtiyat payı eklenmiş haldir, kullanılmaz.
const VAKITLER = [
  ['Fajr', 'İmsak'],
  ['Sunrise', 'Güneş'],
  ['Dhuhr', 'Öğle'],
  ['Asr', 'İkindi'],
  ['Maghrib', 'Akşam'],
  ['Isha', 'Yatsı'],
]

export default {
  name: 'namaz',
  aliases: ['vakit', 'ezan', 'namazvakti'],
  description: 'Şehrin bugünkü namaz vakitleri (Diyanet hesabı)',
  usage: '.namaz İstanbul',
  details: [
    'Örnekler: `.namaz Ankara`  •  `.namaz Kadıköy, İstanbul`  •  `.namaz Berlin`',
    'Vakitler Diyanet hesap yöntemiyle, o şehrin yerel saatine göredir.',
  ],
  category: 'araç',
  ownerOnly: false,
  // Dış servis: hız sınırına takılmayalım.
  cooldown: 10,

  async execute({ sock, msg, from, text }) {
    const yer = text.trim()
    if (!yer) {
      await sock.sendMessage(from, { text: '🕌 Hangi şehir? Örnek: `.namaz Bursa`' }, { quoted: msg })
      return
    }

    let data
    try {
      const params = new URLSearchParams({ address: yer, method: DIYANET })
      ;({ data } = await getJson(`${VAKIT_URL}?${params}`, { timeoutMs: 10_000 }))
    } catch (err) {
      // Aladhan bulamadığı adres için 400 döner; servis çökmesinden ayrı söylenir.
      if (err.status === 400) {
        await sock.sendMessage(from, { text: `🕌 "${yer}" diye bir yer bulamadım.` }, { quoted: msg })
        return
      }
      logger.error({ err, yer }, 'Namaz vakitleri alınamadı')
      await sock.sendMessage(from, { text: '🕌 Namaz vakti servisi şu an cevap vermiyor.' }, { quoted: msg })
      return
    }

    // Saatler "05:51 (+03)" biçiminde gelebilir; yalnızca saat kısmı gösterilir.
    const saat = (v) => String(data.timings[v] || '').split(' ')[0]
    // timestamp o günün öğlesine denk gelir; UTC ile biçimlemek günü kaydırmaz.
    const tarih = tarihBicimi.format(new Date(Number(data.date.timestamp) * 1000))
    const satirlar = VAKITLER.map(([alan, ad]) => `${ad.padEnd(7, ' ')}  *${saat(alan)}*`)

    await sock.sendMessage(
      from,
      {
        text: [`🕌 *${yer}* — ${tarih}`, '', ...satirlar, '', '_Diyanet hesabı (Aladhan)_'].join('\n'),
      },
      { quoted: msg },
    )
  },
}
