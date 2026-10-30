import logger from '../lib/logger.js'

// Open-Meteo: ücretsiz, API key istemez.
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const HAVA_URL = 'https://api.open-meteo.com/v1/forecast'
const ZAMAN_ASIMI_MS = 6000

// WMO hava durumu kodları (Open-Meteo `weather_code`).
const DURUMLAR = [
  [[0], '☀️', 'Açık'],
  [[1, 2], '🌤️', 'Parçalı bulutlu'],
  [[3], '☁️', 'Kapalı'],
  [[45, 48], '🌫️', 'Sisli'],
  [[51, 53, 55, 56, 57], '🌦️', 'Çisenti'],
  [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Yağmurlu'],
  [[71, 73, 75, 77, 85, 86], '❄️', 'Karlı'],
  [[95, 96, 99], '⛈️', 'Fırtına'],
]

function durum(kod) {
  const bulunan = DURUMLAR.find(([kodlar]) => kodlar.includes(kod))
  return bulunan ? { emoji: bulunan[1], ad: bulunan[2] } : { emoji: '🌡️', ad: 'Bilinmiyor' }
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(ZAMAN_ASIMI_MS) })
  if (!response.ok) throw new Error(`Open-Meteo ${response.status} döndü`)
  return response.json()
}

/**
 * Şehir adını koordinata çevirir. Aynı adlı küçük köyler ilk sırada
 * gelebildiği için ("Kadıköy" → Yalova'da bir köy) ilk 5 sonuçtan nüfusu en
 * büyük olan seçilir.
 */
async function konumBul(sehir) {
  const url = `${GEO_URL}?${new URLSearchParams({ name: sehir, count: '5', language: 'tr' })}`
  const { results } = await getJson(url)
  if (!results?.length) return null

  return results.reduce((en, r) => ((r.population || 0) > (en.population || 0) ? r : en))
}

export default {
  name: 'hava',
  aliases: ['havadurumu', 'weather'],
  description: 'Şehrin anlık hava durumu ve günün en düşük/en yüksek sıcaklığı',
  usage: '.hava İstanbul',
  ownerOnly: false,
  // Dış servis: hız sınırına takılmayalım.
  cooldown: 10,

  async execute({ sock, msg, from, text }) {
    const sehir = text.trim()
    if (!sehir) {
      await sock.sendMessage(from, { text: 'Hangi şehir? Örnek: `.hava İzmir`' }, { quoted: msg })
      return
    }

    try {
      const konum = await konumBul(sehir)
      if (!konum) {
        await sock.sendMessage(from, { text: `"${sehir}" diye bir yer bulamadım.` }, { quoted: msg })
        return
      }

      const params = new URLSearchParams({
        latitude: String(konum.latitude),
        longitude: String(konum.longitude),
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: 'auto',
        forecast_days: '1',
      })
      const { current, daily } = await getJson(`${HAVA_URL}?${params}`)
      const d = durum(current.weather_code)
      const yer = [konum.name, konum.admin1, konum.country].filter(Boolean).join(', ')

      await sock.sendMessage(
        from,
        {
          text: [
            `${d.emoji} *${yer}*`,
            '',
            `${d.ad}, ${Math.round(current.temperature_2m)}°C (hissedilen ${Math.round(current.apparent_temperature)}°C)`,
            `🔻 ${Math.round(daily.temperature_2m_min[0])}°C  🔺 ${Math.round(daily.temperature_2m_max[0])}°C`,
            `💧 Nem %${current.relative_humidity_2m}  •  💨 ${Math.round(current.wind_speed_10m)} km/sa`,
            `☔ Yağış ihtimali %${daily.precipitation_probability_max[0] ?? 0}`,
          ].join('\n'),
        },
        { quoted: msg },
      )
    } catch (err) {
      logger.error({ err, sehir }, 'Hava durumu alınamadı')
      await sock.sendMessage(
        from,
        { text: '🌡️ Hava durumu servisi şu an cevap vermiyor.' },
        { quoted: msg },
      )
    }
  },
}
