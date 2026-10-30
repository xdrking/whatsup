import logger from '../lib/logger.js'
import { getJson } from '../lib/http.js'

// AFAD'ın açık deprem servisi: API key istemez. Tarihler UTC verilir ve UTC döner.
const AFAD_URL = 'https://deprem.afad.gov.tr/apiv2/event/filter'

const LISTE_BOYU = 10
const VARSAYILAN_MIN = 2.5
// Büyüklük verilirse daha geniş aralığa bakılır: 4+ deprem her gün olmaz.
const GUN_VARSAYILAN = 1
const GUN_BUYUKLUK_ILE = 7

const saatBicimi = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

// AFAD "2026-10-30T22:06:48" biçiminde, saat dilimi işaretsiz UTC döner.
function istanbulSaati(afadTarihi) {
  return saatBicimi.format(new Date(`${afadTarihi}Z`))
}

function isaret(buyukluk) {
  if (buyukluk >= 5) return '🔴'
  if (buyukluk >= 4) return '🟠'
  if (buyukluk >= 3) return '🟡'
  return '🟢'
}

export default {
  name: 'deprem',
  aliases: ['depremler', 'sondepremler', 'afad'],
  description: 'AFAD\'a göre son depremler',
  usage: '.deprem  —  .deprem 4',
  details: [
    '`.deprem` → son 24 saatteki 2.5 ve üstü en yeni 10 deprem.',
    '`.deprem 4` → son 7 gündeki 4.0 ve üstü depremler.',
    'Saatler Türkiye saatidir. Veri AFAD\'dandır.',
  ],
  category: 'araç',
  ownerOnly: false,
  // Dış servis: hız sınırına takılmayalım.
  cooldown: 10,

  async execute({ sock, msg, from, args }) {
    const istenen = Number.parseFloat((args[0] || '').replace(',', '.'))
    const buyuklukVerildi = Number.isFinite(istenen) && istenen > 0 && istenen < 10
    const min = buyuklukVerildi ? istenen : VARSAYILAN_MIN
    const gun = buyuklukVerildi ? GUN_BUYUKLUK_ILE : GUN_VARSAYILAN

    const bitis = new Date()
    const baslangic = new Date(bitis.getTime() - gun * 86_400_000)
    // AFAD milisaniye ve "Z" kabul etmiyor: "2026-10-30T22:06:48".
    const utc = (d) => d.toISOString().slice(0, 19)

    const params = new URLSearchParams({
      start: utc(baslangic),
      end: utc(bitis),
      minmag: String(min),
      orderby: 'timedesc',
      limit: String(LISTE_BOYU),
    })

    let olaylar
    try {
      olaylar = await getJson(`${AFAD_URL}?${params}`, { timeoutMs: 10_000 })
    } catch (err) {
      logger.error({ err }, 'Deprem listesi alınamadı')
      await sock.sendMessage(from, { text: '🌍 AFAD servisi şu an cevap vermiyor.' }, { quoted: msg })
      return
    }

    // Servis minmag'ı yok sayarsa da liste doğru kalsın.
    const liste = (Array.isArray(olaylar) ? olaylar : [])
      .filter((o) => Number(o.magnitude) >= min)
      .slice(0, LISTE_BOYU)

    const aralik = gun === 1 ? 'son 24 saatte' : `son ${gun} günde`

    if (!liste.length) {
      await sock.sendMessage(
        from,
        { text: `🌍 ${aralik} ${min.toFixed(1)} ve üstü deprem yok.` },
        { quoted: msg },
      )
      return
    }

    const satirlar = liste.map((o) => {
      const b = Number(o.magnitude)
      const derinlik = Number.parseFloat(o.depth)
      return `${isaret(b)} *${b.toFixed(1)}*  ${o.location}\n     ${istanbulSaati(o.date)}  •  ${derinlik.toFixed(1)} km`
    })

    await sock.sendMessage(
      from,
      {
        text: [`🌍 *Son depremler* (${aralik}, ${min.toFixed(1)}+)`, '', ...satirlar, '', '_Kaynak: AFAD_'].join('\n'),
      },
      { quoted: msg },
    )
  },
}
