import logger from '../lib/logger.js'
import { istanbulDay, loadDataset } from '../lib/dataset.js'
import { fnv1a } from '../lib/hash.js'

const BURCLAR = {
  koç: '♈', boğa: '♉', ikizler: '♊', yengeç: '♋', aslan: '♌', başak: '♍',
  terazi: '♎', akrep: '♏', yay: '♐', oğlak: '♑', kova: '♒', balık: '♓',
}

// Türkçe klavyesi olmayan da yazabilsin.
const ESANLAM = { koc: 'koç', boga: 'boğa', yengec: 'yengeç', basak: 'başak', oglak: 'oğlak', balik: 'balık' }

function yildiz(tohum) {
  const puan = 1 + (fnv1a(tohum) % 5)
  return '★'.repeat(puan) + '☆'.repeat(5 - puan)
}

export default {
  name: 'burç',
  aliases: ['burc', 'horoskop'],
  description: 'Burcunun günlük yorumu — gün boyunca değişmez',
  usage: '.burç akrep',
  details: [
    'Burçlar: koç, boğa, ikizler, yengeç, aslan, başak, terazi, akrep, yay, oğlak, kova, balık',
    'Yorum Türkiye saatiyle gün boyunca aynıdır, gece yarısı değişir.',
    'Eğlence içindir 🙂',
  ],
  category: 'eğlence',
  ownerOnly: false,

  async execute({ sock, msg, from, args }) {
    const istenen = (args[0] || '').toLocaleLowerCase('tr')
    const burc = ESANLAM[istenen] || istenen

    if (!BURCLAR[burc]) {
      await sock.sendMessage(
        from,
        { text: `🔮 Hangi burç? \`.burç akrep\`\n\n${Object.keys(BURCLAR).join(', ')}` },
        { quoted: msg },
      )
      return
    }

    let yorumlar
    try {
      yorumlar = await loadDataset('burclar.json')
    } catch (err) {
      logger.error({ err }, 'Burç havuzu okunamadı')
      await sock.sendMessage(
        from,
        { text: '`data/burclar.json` okunamadı; dosya eksik, bozuk ya da boş olabilir.' },
        { quoted: msg },
      )
      return
    }

    // Burç + gün seed'i: aynı gün aynı burç hep aynı yorumu alır (bkz. .gününsözü).
    const tohum = `${burc}|${istanbulDay()}`
    const yorum = yorumlar[fnv1a(tohum) % yorumlar.length]
    const sansliSayi = 1 + (fnv1a(`sayı|${tohum}`) % 99)

    await sock.sendMessage(
      from,
      {
        text: [
          `${BURCLAR[burc]} *${burc.toLocaleUpperCase('tr')}* — bugün`,
          '',
          yorum,
          '',
          `❤️ Aşk   ${yildiz(`aşk|${tohum}`)}`,
          `💰 Para  ${yildiz(`para|${tohum}`)}`,
          `💪 Sağlık ${yildiz(`sağlık|${tohum}`)}`,
          `🍀 Şanslı sayı: ${sansliSayi}`,
        ].join('\n'),
      },
      { quoted: msg },
    )
  },
}
