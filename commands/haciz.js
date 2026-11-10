import logger from '../lib/logger.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { miktarCoz } from '../lib/kumar.js'
import { mulkBul } from '../lib/mulk.js'
import { btcFiyati, SULY, sulyCoz, sulyYaz } from '../lib/kripto.js'
import { bankaDurumu, botHesabiMi, hacizEt, kriptoHaciz, mulkHaciz } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'

const sayi = new Intl.NumberFormat('tr-TR')
const KAPALI = '⚖️ Haciz şu an yapılamıyor.'

export default {
  name: 'haciz',
  aliases: [],
  description: 'Kişinin parasını botun bankasına aktarır, yetmezse eksiye düşürür',
  usage: '.haciz @kişi <miktar|hepsi|yarısı|mülk>  —  .haciz @kişi suly <miktar|hepsi>',
  category: 'ekonomi',
  ownerOnly: true,

  async execute({ sock, msg, args, text, from, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      // `args` verilmez: miktar 8+ haneliyse elle yazılmış numara sanılırdı.
      const [hedefHam] = resolveTargets(parsed)
      const miktarArg = args.find((a) => !a.startsWith('@'))
      if (!hedefHam || !miktarArg) return await yaz('Kullanım: `.haciz @kişi <miktar|hepsi|yarısı|mülk>`')

      const hedef = uyeKimligiBul(metadata, hedefHam)
      if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (botHesabiMi(hedef)) return await yaz('🤖 Botun hesabına haciz konmaz.')

      // Suly'yi yalnızca bu komut alır (bot sahibinin kararı). Miktar ham metinden okunur: "0.001" 1 olmasın.
      if (SULY.adlar.includes(miktarArg.toLocaleLowerCase('tr'))) {
        const kelimeler = String(text || '').split(/\s+/).map((k) => k.toLocaleLowerCase('tr'))
        const ham = kelimeler[kelimeler.findIndex((k) => SULY.adlar.includes(k)) + 1] || 'hepsi'
        const hepsi = ['hepsi', 'tümü', 'tumu'].includes(ham)
        const birim = hepsi ? null : sulyCoz(ham)
        if (!hepsi && !birim) return await yaz('Kullanım: `.haciz @kişi suly <miktar|hepsi>`')

        const fiyat = await btcFiyati()
        if (!fiyat) return await yaz('⚖️ Bitcoin fiyatı şu an alınamıyor, Suly haczedilemez.')

        const k = kriptoHaciz({ chatJid: from, userJid: hedef, birim, usd: fiyat.usd })
        if (!k || k.kapali) return await yaz(KAPALI)
        if (k.yok) return await yaz(`⚖️ ${mentionOf(hedef)} kişisinde Suly yok.`, [hedef])
        return await yaz(
          `⚖️ *Haciz* — ${mentionOf(hedef)}: ${sulyYaz(k.alinan)} Suly alındı, ${sulyYaz(k.kalan)} kaldı.\n🏦 Kasaya giren: ${sayi.format(k.kasaya)} XP`,
          [hedef],
        )
      }

      const mulk = mulkBul(miktarArg)
      if (mulk) {
        const m = mulkHaciz({ chatJid: from, userJid: hedef, mulk })
        if (!m || m.kapali) return await yaz(KAPALI)
        if (m.yok) return await yaz(`⚖️ ${mentionOf(hedef)} kişisinde ${mulk.ad} yok.`, [hedef])
        return await yaz(
          `⚖️ *Haciz* — ${mentionOf(hedef)}: ${mulk.ad} alındı, ${m.kalan} tane kaldı.\n🏦 Kasaya giren: ${sayi.format(m.kasaya)} XP`,
          [hedef],
        )
      }

      const durum = bankaDurumu({ chatJid: from, userJid: hedef })
      if (!durum) return await yaz(KAPALI)

      // Sayı yazılırsa bakiyeyle sınırlanmaz, eksiğini `hacizEt` eksi yazar.
      // `hepsi` ve `yarısı` banka hesabına göredir.
      const c = miktarCoz(miktarArg, /^\d+$/.test(miktarArg) ? Number(miktarArg) : durum.bakiye)
      if (c.hata) return await yaz(`⚖️ ${c.hata.replace('Senin XP\'n', 'Hesabı')}`)

      const s = hacizEt({ chatJid: from, userJid: hedef, miktar: c.miktar })
      if (!s || s.kapali) return await yaz(KAPALI)

      await yaz(
        [
          `⚖️ *Haciz* — ${mentionOf(hedef)}: ${sayi.format(c.miktar)} XP`,
          `🏦 Kasaya giren: ${sayi.format(s.kasaya)} XP`,
          ...(s.eksi ? [`📉 Eksi yazılan: ${sayi.format(s.eksi)} XP`] : []),
          `💰 Kalan hesap: ${sayi.format(s.bakiye)} XP  •  Cüzdan: ${sayi.format(s.xp)} XP`,
        ].join('\n'),
        [hedef],
      )
    } catch (err) {
      logger.error({ err, from }, '.haciz başarısız')
      await yaz('⚖️ Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.haciz hata mesajı gönderilemedi'),
      )
    }
  },
}
