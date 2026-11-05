import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { botHesabiMi, xpDevret } from '../lib/stats.js'
import { digitsOf, mentionOf, resolveTargets } from '../lib/target.js'
import logger from '../lib/logger.js'

const KULLANIM = 'Kullanım: `.devret @kişi <miktar>`\nÖrnek: `.devret @ali 100`'

/**
 * Etiketleri metindeki sıraya dizer. `mentionedJid` dizisinin sırası garanti
 * değil; `.devret @a @b 50` için sıra XP'nin yönünü belirler.
 */
export function etiketSirasi(metin, jidler) {
  const konum = (jid) => {
    const i = metin.indexOf(`@${digitsOf(jid)}`)
    return i === -1 ? metin.length : i
  }
  return [...jidler].sort((a, b) => konum(a) - konum(b))
}

export default {
  name: 'devret',
  aliases: ['transfer', 'xpdevret'],
  description: 'Kendi XP\'nden başkasına devreder',
  usage: '.devret @kişi <miktar>  —  bir mesajı yanıtlayarak .devret <miktar>',
  details: [
    'Örnek: `.devret @ali 100` — senden 100 XP düşer, Ali\'ye 100 XP geçer.',
    'Yalnızca kendi XP\'ni devredebilirsin. XP her grupta ayrıdır.',
  ],
  category: 'istatistik',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, args, text, from, sender, parsed, isOwner }) {
    const yaz = (metin, mentions = []) =>
      sock.sendMessage(from, { text: metin, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      // `args` verilmez: miktar 8+ haneliyse elle yazılmış numara sanılırdı.
      const etiketler = etiketSirasi(text, resolveTargets({ ...parsed, quoted: null }, { limit: 3 }))

      if (etiketler.length >= 2 && !isOwner) {
        await yaz('❌ Yalnızca kendi XP\'ni devredebilirsin.')
        return
      }

      const miktarArg = args.find((a) => /^\d+$/.test(a))
      const miktar = Number(miktarArg)
      const [hedefHam] = etiketler.length ? etiketler.slice(-1) : resolveTargets(parsed)

      if (etiketler.length > 2 || !hedefHam || !Number.isSafeInteger(miktar) || miktar <= 0) {
        await yaz(KULLANIM)
        return
      }

      // XP, üyenin istatistik anahtarına yazılmalı; gruptan olmayan birine
      // giden XP kaybolur.
      const hedef = uyeKimligiBul(metadata, hedefHam)
      const kaynak = etiketler.length === 2 ? uyeKimligiBul(metadata, etiketler[0]) : sender
      if (!hedef || !kaynak) {
        await yaz('❌ Bu kişi grupta bulunamadı.')
        return
      }

      if (kaynak === hedef) {
        await yaz('❌ Aynı kişiye devir yapılamaz.')
        return
      }

      // Sonuç mesajı iki bakiyeyi de yazar, botunki yalnızca .top'ta görünür.
      if (botHesabiMi(hedef) && !isOwner) {
        await yaz('🤖 Bota XP gönderilemez.')
        return
      }

      const sonuc = xpDevret({ chatJid: from, kaynak, hedef, miktar })
      if (!sonuc) {
        await yaz('❌ XP şu an devredilemiyor.')
        return
      }

      if (sonuc.yetersiz) {
        await yaz(
          kaynak === sender
            ? `❌ O kadar XP'n yok. Senin XP'n: ${sonuc.xp}`
            : `❌ ${mentionOf(kaynak)} kişisinde o kadar XP yok. XP'si: ${sonuc.xp}`,
          [kaynak],
        )
        return
      }

      await yaz(
        [
          `🤝 ${mentionOf(kaynak)} → ${mentionOf(hedef)}: *${miktar} XP*`,
          `💰 ${mentionOf(kaynak)}: ${sonuc.kaynakXp} XP`,
          `💰 ${mentionOf(hedef)}: ${sonuc.hedefXp} XP`,
        ].join('\n'),
        [kaynak, hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.devret başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.devret hata mesajı gönderilemedi'),
      )
    }
  },
}
