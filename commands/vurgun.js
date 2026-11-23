import { sureYaz } from './cark.js'
import { requireGroup } from '../lib/group.js'
import { HAPIS_SAATI } from '../lib/hapis.js'
import { vurgunBekleme } from '../lib/stats.js'
import { ROLLER, VURGUN_ARALIGI_MS, VURGUN_ARZ_YUZDESI, VURGUN_EN_AZ, VURGUN_KASA_YUZDESI } from '../lib/yeralti.js'
import { start } from '../games/vurgun.js'
import { getGame } from '../games/gameManager.js'
import logger from '../lib/logger.js'

export default {
  name: 'vurgun',
  aliases: ['merkezbankası', 'merkezbankasi', 'banksoygunu'],
  description: 'Ekip kurup Merkez Bankası\'nı (hazineyi) soyma oyunu',
  usage: '.vurgun',
  details: [
    `${VURGUN_EN_AZ}-${ROLLER.length} kişi. Lobi mesajına rolünü yanıtla: ${ROLLER.map((r) => r.adlar[0]).join(', ')}. Her rolden bir kişi. Kuran \`başla\` yazar.`,
    ...ROLLER.map((r) => `${r.ad}: ${r.not}`),
    `Ganimet hazinenin %${VURGUN_KASA_YUZDESI}'udur, piyasanın %${VURGUN_ARZ_YUZDESI}'unu geçmez; ekibe eşit bölünür. Başarısızsa VPN'i olmayan ${HAPIS_SAATI} saat hapse girer.`,
    `Grupta ${VURGUN_ARALIGI_MS / 3_600_000} saatte bir yapılır. Harcanan hacker ve çilingir geri gelmez.`,
  ],
  category: 'oyun',
  cooldown: 10,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return
      if (getGame(from)) return await yaz('⚠️ Bu grupta zaten aktif bir oyun var.')
      const hazir = vurgunBekleme(from)
      if (hazir) return await yaz(`🚓 Merkez Bankası hâlâ polis kaynıyor, ${sureYaz(hazir - Date.now())} kaldı.`)
      await start({ sock, msg, from, sender })
    } catch (err) {
      logger.error({ err, from }, '.vurgun başarısız')
      await yaz('🏦 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.vurgun hata mesajı gönderilemedi'))
    }
  },
}
