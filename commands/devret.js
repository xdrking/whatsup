import { binlik } from '../lib/sayi.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { botHesabiMi, getStats, xpDevret } from '../lib/stats.js'
import { digitsOf, mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KULLANIM = 'Kullanım: `.devret @kişi <miktar|hepsi|yarısı>`\nÖrnek: `.devret @ali 100`, `.devret @ali 50 milyon`'
const TUMU = new Set(['hepsi', 'all', 'hep', 'allin'])
const YARISI = new Set(['yarısı', 'yarisi', 'yarı', 'yari'])

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
  usage: '.devret @kişi <miktar|hepsi|yarısı>  —  bir mesajı yanıtlayarak .devret <miktar>',
  details: [
    'Örnek: `.devret @ali 100` — senden 100 XP düşer, Ali\'ye 100 XP geçer.',
    '`.devret @ali hepsi` cüzdanının tamamını, `yarısı` yarısını gönderir. Tutar `50 milyon`, `1,5 milyar`, `50m` diye de yazılabilir.',
    'Yalnızca kendi XP\'ni devredebilirsin. XP her grupta ayrıdır.',
  ],
  category: 'ekonomi',
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

      const miktarArg = trLower(args.find((a) => /^\d+$/.test(a) || TUMU.has(trLower(a)) || YARISI.has(trLower(a))) ?? '')
      const [hedefHam] = etiketler.length ? etiketler.slice(-1) : resolveTargets(parsed)

      if (etiketler.length > 2 || !hedefHam || !miktarArg) {
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

      // "hepsi" kaynağın o anki cüzdanıdır; arada değişirse xpDevret yetersiz der.
      const cuzdan = () => getStats(from, kaynak).xp
      const miktar = TUMU.has(miktarArg) ? cuzdan()
        : YARISI.has(miktarArg) ? Math.floor(cuzdan() / 2)
          : Number(miktarArg)

      if (!Number.isSafeInteger(miktar) || miktar <= 0) {
        await yaz(/^\d+$/.test(miktarArg) ? KULLANIM : '❌ Devredecek XP yok.')
        return
      }

      // Sonuç mesajı iki bakiyeyi de yazar, botunki yalnızca .top'ta görünür.
      if (botHesabiMi(hedef) && !isOwner) {
        await yaz('🤖 Bota XP gönderilemez.')
        return
      }

      const sonuc = xpDevret({ chatJid: from, kaynak, hedef, miktar, sahipDevri: isOwner && kaynak !== sender })
      if (!sonuc) {
        await yaz('❌ XP şu an devredilemiyor.')
        return
      }

      if (sonuc.kredili) {
        await yaz('💳 Kredi borcu varken XP devredilemez.')
        return
      }

      if (sonuc.yetersiz) {
        await yaz(
          kaynak === sender
            ? `❌ O kadar XP'n yok. Senin XP'n: ${binlik(sonuc.xp)}`
            : `❌ ${mentionOf(kaynak)} kişisinde o kadar XP yok. XP'si: ${binlik(sonuc.xp)}`,
          [kaynak],
        )
        return
      }

      await yaz(
        [
          `🤝 ${mentionOf(kaynak)} → ${mentionOf(hedef)}: *${binlik(miktar)} XP*`,
          `💰 ${mentionOf(kaynak)}: ${binlik(sonuc.kaynakXp)} XP`,
          `💰 ${mentionOf(hedef)}: ${binlik(sonuc.hedefXp)} XP`,
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
