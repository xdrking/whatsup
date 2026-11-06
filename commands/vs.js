import { binlik } from '../lib/sayi.js'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { kumarEngeli, MIN_BAHIS, MIN_KUMAR_BAKIYESI } from '../lib/kumar.js'
import { getStats, kumarYasagi } from '../lib/stats.js'
import { resolveTargets } from '../lib/target.js'
import { getGame } from '../games/gameManager.js'
import { start } from '../games/vs.js'

export default {
  name: 'vs',
  aliases: ['meydan', 'kapış'],
  description: 'Biriyle XP bahsine gir — kazanan rakibinin XP\'sini alır',
  usage: '.vs @kişi <miktar>  —  bir mesajı yanıtlayarak .vs <miktar>',
  details: [
    'Örnek: `.vs @ali 100`. Rakip 60 sn içinde botun mesajına `kabul` ya da `red` yazar.',
    'Kabul ederse yazı-tura atılır: kazanan +100, kaybeden −100 XP.',
    `Kabul edilmeden XP'ye dokunulmaz. En az ${MIN_BAHIS} XP, iki tarafın da XP'si yetmeli.`,
  ],
  category: 'oyun',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!metadata) return

    const miktar = Number(args.find((a) => /^\d+$/.test(a)))
    // `args` verilmez: miktar 8+ haneliyse elle yazılmış numara sanılırdı.
    const [hedef] = resolveTargets(parsed)
    const rakip = hedef && uyeKimligiBul(metadata, hedef)
    const xp = getStats(from, sender).xp

    let hata = null
    if (!hedef || !Number.isSafeInteger(miktar)) hata = 'Kullanım: `.vs @kişi <miktar>`'
    else if (!rakip) hata = '❌ Bu kişi grupta bulunamadı.'
    else if (rakip === sender) hata = 'Kendinle bahse giremezsin 🙃'
    else if (rakip === jidNormalizedUser(sock.user?.id || '')) hata = 'Kasa bu masaya oturmaz 🤖'
    else if (kumarEngeli(xp, kumarYasagi(from, sender))) hata = kumarEngeli(xp, kumarYasagi(from, sender))
    else if (kumarEngeli(getStats(from, rakip).xp, kumarYasagi(from, rakip))) hata = `❌ Rakibin kumar oynayamıyor: cüzdanında ${MIN_KUMAR_BAKIYESI} XP yok ya da kumar yasağı var.`
    else if (miktar < MIN_BAHIS) hata = `En az ${MIN_BAHIS} XP basabilirsin.`
    else if (miktar > xp) hata = `O kadar XP'n yok. Senin XP'n: ${binlik(xp)}`
    else if (getStats(from, rakip).xp < miktar) hata = '❌ Rakibin o kadar XP\'si yok.'
    else if (getGame(from)) hata = '⚠️ Bu grupta zaten aktif bir oyun var.'

    if (hata) return yaz(hata)

    await start({ sock, msg, from, sender, rakip, miktar })
  },
}
