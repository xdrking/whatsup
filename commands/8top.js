import logger from '../lib/logger.js'
import { pickRandom } from '../lib/dataset.js'

export default {
  name: '8top',
  aliases: ['sihirlitop', 'top8', 'kehanet'],
  description: 'Sihirli 8 topu evet/hayır sorunu cevaplar',
  usage: '.8top bugün yağmur yağar mı?',
  category: 'eğlence',
  ownerOnly: false,

  async execute({ sock, msg, from, text }) {
    const soru = text.trim()
    if (!soru) {
      await sock.sendMessage(from, { text: '🎱 Bir soru sor: `.8top yarın sınav iyi geçer mi?`' }, { quoted: msg })
      return
    }

    let cevap
    try {
      cevap = await pickRandom('8top.json', from)
    } catch (err) {
      logger.error({ err }, '8top havuzu okunamadı')
      await sock.sendMessage(
        from,
        { text: '`data/8top.json` okunamadı; dosya eksik, bozuk ya da boş olabilir.' },
        { quoted: msg },
      )
      return
    }

    await sock.sendMessage(from, { text: `🎱 _${soru}_\n\n*${cevap}*` }, { quoted: msg })
  },
}
