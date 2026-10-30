import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { requireGroup } from '../lib/group.js'
import { resolveTargets } from '../lib/target.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/duello.js'

export default {
  name: 'düello',
  aliases: ['duello', 'kapışma', 'kapisma', 'vs'],
  description: 'Biriyle hızlı matematik düellosu — ilk doğru cevap kazanır',
  usage: '.düello @kişi  —  ya da bir mesajı yanıtlayarak .düello',
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const [rakip] = resolveTargets(parsed, { args, limit: 1 })
    const bot = jidNormalizedUser(sock.user?.id || '')

    let hata = null
    if (!rakip) hata = 'Kime meydan okuyorsun? `.düello @kişi` yaz ya da birinin mesajını yanıtla.'
    else if (rakip === sender) hata = 'Kendinle düello olmaz 🙃'
    else if (rakip === bot) hata = 'Benimle mi? Hesap makinesiyle yarışılmaz 🤖'
    else if (getGame(from)) hata = '⚠️ Bu grupta zaten aktif bir oyun var.'

    if (hata) {
      await sock.sendMessage(from, { text: hata }, { quoted: msg })
      return
    }

    await start({ sock, msg, from, sender, rakip })
  },
}
