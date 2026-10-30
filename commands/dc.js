import logger from '../lib/logger.js'
import { pickRandom } from '../lib/dataset.js'
import { mentionOf, resolveTargets } from '../lib/target.js'

const TURLER = {
  doğruluk: { dosya: 'dogruluk.json', baslik: '🟢 *DOĞRULUK*' },
  cesaret: { dosya: 'cesaret.json', baslik: '🔴 *CESARET*' },
}

// ".dc d", ".dc doğruluk", ".dc dogruluk" hepsi aynı.
function turCoz(arg) {
  const a = (arg || '').toLocaleLowerCase('tr')
  if (['d', 'doğruluk', 'dogruluk'].includes(a)) return 'doğruluk'
  if (['c', 'cesaret'].includes(a)) return 'cesaret'
  return null
}

export default {
  name: 'dc',
  aliases: ['doğrulukcesaret', 'dogrulukcesaret', 'td'],
  description: 'Doğruluk mu cesaret mi — hedefe soru ya da görev verir',
  usage: '.dc  —  .dc d @kişi  —  .dc c (bir mesajı yanıtlayarak)',
  details: [
    '`.dc` → kendine rastgele doğruluk ya da cesaret.',
    '`.dc d` → doğruluk sorusu, `.dc c` → cesaret görevi.',
    'Başkasına vermek için etiketle ya da mesajını yanıtla: `.dc c @kişi`',
  ],
  category: 'eğlence',
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const tur = turCoz(args[0]) || (Math.random() < 0.5 ? 'doğruluk' : 'cesaret')
    const { dosya, baslik } = TURLER[tur]

    // Hedef yoksa komutu yazan kişi oynar.
    const [jid] = resolveTargets(parsed, { args, limit: 1, includeSender: true })

    let satir
    try {
      satir = await pickRandom(dosya, from)
    } catch (err) {
      logger.error({ err, dosya }, 'Doğruluk/cesaret havuzu okunamadı')
      await sock.sendMessage(
        from,
        { text: `\`data/${dosya}\` okunamadı; dosya eksik, bozuk ya da boş olabilir.` },
        { quoted: msg },
      )
      return
    }

    await sock.sendMessage(
      from,
      { text: [`${baslik}  ${mentionOf(jid)}`, '', satir].join('\n'), mentions: [jid] },
      { quoted: msg },
    )
  },
}
