import { HISSELER, hisseBul, IFLAS_FIYATI, KOMISYON_YUZDESI } from '../lib/borsa.js'
import { requireGroup } from '../lib/group.js'
import { miktarCoz } from '../lib/kumar.js'
import { borsaAl, borsaDurumu, borsaSat } from '../lib/stats.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const sayi = new Intl.NumberFormat('tr-TR')
const ondalik = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const KAPALI = '📈 Borsa şu an kapalı, sonra dene.'
const KODLAR = HISSELER.map((h) => h.kod).join(', ')

function degisim({ fiyat, onceki }) {
  const yuzde = ((fiyat - onceki) / onceki) * 100
  if (Math.abs(yuzde) < 0.05) return '➖'
  return `${yuzde > 0 ? '🟢' : '🔴'} %${ondalik.format(Math.abs(yuzde))}`
}

export default {
  name: 'borsa',
  aliases: ['hisse', 'stock'],
  description: 'Uydurma hisselerde XP ile al sat yap',
  usage: '.borsa  —  .borsa al <hisse> <miktar|hepsi|yarısı>  —  .borsa sat <hisse> <miktar|hepsi|yarısı>',
  details: [
    `Hisseler: ${KODLAR}. Her 15 dakika borsada bir gün gibidir: fiyatlar sert oynar, sağdakiler daha da sert.`,
    'Piyasa sakin ya da fırtınalı olabilir, hisseler çoğu zaman birlikte hareket eder, haberler fiyatı sıçratır. Hiçbiri yönü önceden söylemez.',
    'Örnek: `.borsa al kedi 500` 500 XP\'lik alır, `.borsa sat kedi hepsi` tamamını satar.',
    `Alışta ve satışta %${KOMISYON_YUZDESI} komisyon kesilir.`,
    `Fiyatı ${IFLAS_FIYATI} XP'nin altına düşen hisse batar: elindekiler silinir, hisse 100 XP'den yeniden açılır.`,
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const durum = borsaDurumu({ chatJid: from, userJid: sender })
      if (!durum) return await yaz(KAPALI)

      const islem = trLower(args[0] || '')

      if (['al', 'buy'].includes(islem)) {
        const hisse = hisseBul(args[1])
        if (!hisse) return await yaz(`📈 Hisse yaz: ${KODLAR}\nÖrnek: \`.borsa al kedi 500\``)

        const c = miktarCoz(args[2], durum.xp)
        if (c.hata) return await yaz(`📈 ${c.hata}`)

        const s = borsaAl({ chatJid: from, userJid: sender, hisse, miktar: c.miktar })
        if (!s) return await yaz(KAPALI)
        if (s.yetersiz) return await yaz(`📈 O kadar XP'n yok. Senin XP'n: ${sayi.format(s.xp)}`)

        return await yaz([
          `📈 *${hisse.ad}* alındı: ${sayi.format(c.miktar)} XP`,
          `🏷️ Fiyat: ${ondalik.format(s.fiyat)} XP  •  💸 Komisyon: ${sayi.format(s.komisyon)} XP`,
          `💰 XP'n: ${sayi.format(s.xp)}`,
        ].join('\n'))
      }

      if (['sat', 'sell'].includes(islem)) {
        const hisse = hisseBul(args[1])
        if (!hisse) return await yaz(`📈 Hisse yaz: ${KODLAR}\nÖrnek: \`.borsa sat kedi hepsi\``)

        const pozisyon = durum.portfoy.find((p) => p.kod === hisse.kod)
        if (!pozisyon) return await yaz(`📈 Elinde ${hisse.ad} yok.`)

        // `hepsi` miktar sınırına takılmasın: değeri 10 XP'nin altına düşen pay da satılabilmeli.
        const hepsi = ['hepsi', 'all'].includes(trLower(args[2] || ''))
        const c = hepsi ? { miktar: null } : miktarCoz(args[2], pozisyon.deger)
        if (c.hata) return await yaz(`📈 ${c.hata.replace('Senin XP\'n', 'Payının değeri')}`)

        const s = borsaSat({ chatJid: from, userJid: sender, hisse, miktar: c.miktar })
        if (!s) return await yaz(KAPALI)
        if (s.yetersiz) return await yaz(`📈 Payının değeri: ${sayi.format(s.deger)} XP`)

        return await yaz([
          `📉 *${hisse.ad}* satıldı: ${sayi.format(s.satilan)} XP`,
          `💸 Komisyon: ${sayi.format(s.komisyon)} XP  •  ${s.kar >= 0 ? '🟢 Kâr' : '🔴 Zarar'}: ${sayi.format(Math.abs(s.kar))} XP`,
          `💰 XP'n: ${sayi.format(s.xp)}`,
        ].join('\n'))
      }

      const lines = [
        '📈 *Borsa*',
        `Piyasa: ${durum.hava}`,
        '',
        ...durum.hisseler.map((h) =>
          `${h.ad} (\`${h.kod}\`) — ${ondalik.format(h.fiyat)} XP ${degisim(h)}`,
        ),
      ]
      if (durum.haberler.length) {
        lines.push('', '📰 *Haberler*', ...durum.haberler.map((h) => `• ${h}`))
      }
      if (durum.portfoy.length) {
        lines.push('', '💼 *Portföyün*')
        for (const p of durum.portfoy) {
          lines.push(`${p.ad}: ${sayi.format(p.deger)} XP (maliyet ${sayi.format(p.maliyet)})`)
        }
      }
      lines.push('', `💰 XP'n: ${sayi.format(durum.xp)}`, '`.borsa al kedi 500`  •  `.borsa sat kedi hepsi`')

      await yaz(lines.join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.borsa başarısız')
      await yaz('📈 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.borsa hata mesajı gönderilemedi'),
      )
    }
  },
}
