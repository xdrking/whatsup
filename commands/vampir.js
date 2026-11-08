import logger from '../lib/logger.js'
import { requireGroup } from '../lib/group.js'
import { MAX_OYUNCU, MIN_OYUNCU } from '../lib/vampir.js'
import { getGame } from '../games/gameManager.js'
import { geceEylemi, geceEylemiMi, start } from '../games/vampir.js'

export default {
  name: 'vampir',
  aliases: ['vampirköylü', 'vk'],
  description: 'Vampir köylü: gizli roller, gece cinayeti, gündüz oylaması',
  usage: '.vampir',
  details: [
    `1. \`.vampir\` köyü kurar. Bot mesajına \`katıl\` yazan oyuna girer (${MIN_OYUNCU}-${MAX_OYUNCU} kişi), kuran \`başla\` yazar.`,
    '2. Roller özelden gelir: 🧛 vampir, 🩺 doktor, 🔮 kahin, 👨‍🌾 köylü.',
    '3. Gece (90 sn) bota özelden: vampir `.vampir öldür <no>`, doktor `.vampir koru <no>`, kahin `.vampir bak <no>`.',
    '4. Gündüz (3 dk) herkes gruptaki oylama mesajına numara ya da `pas` yazar. Tek başına en çok oyu alan asılır.',
    '5. Bütün vampirler ölürse köy, vampirler köylülere yetişirse vampirler kazanır. Kazanan takım XP alır.',
  ],
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    try {
      if (args[0] && geceEylemiMi(args[0])) {
        if (parsed.isGroup) {
          await sock.sendMessage(from, { text: '🤫 Gece eylemini bana *özelden* yaz!' }, { quoted: msg })
          return
        }
        await geceEylemi({ sock, msg, parsed, args })
        return
      }

      if (!(await requireGroup({ sock, msg, from, parsed }))) return
      if (getGame(from)) {
        await sock.sendMessage(from, { text: '⚠️ Bu grupta zaten aktif bir oyun var.' }, { quoted: msg })
        return
      }
      await start({ sock, msg, from, sender, senderPn: parsed.senderPn })
    } catch (err) {
      logger.error({ err, from }, '.vampir başarısız')
      await sock.sendMessage(from, { text: '🧛 Bir şeyler ters gitti.' }, { quoted: msg }).catch((e) =>
        logger.error({ err: e }, '.vampir hata mesajı gönderilemedi'),
      )
    }
  },
}
