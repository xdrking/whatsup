import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, tefeciCevap, tefeciDurumu, tefeciOde, tefeciTeklif } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { AZAMI_FAIZ, AZAMI_VADE_SAATI, MIN_TEFECI, TEKLIF_SURESI_MS } from '../lib/tefeci.js'
import { trLower } from '../lib/turkishWords.js'
import { sureYaz } from './cark.js'
import logger from '../lib/logger.js'

const KAPALI = '🦈 Tefeci şu an kapalı, sonra dene.'
const KULLANIM = 'Kullanım: `.tefeci ver @kişi <miktar> <faiz %> <saat>`'

export default {
  name: 'tefeci',
  aliases: ['tefecilik', 'faizliborç', 'faizliborc'],
  description: 'Üyeler birbirine faizli borç verir',
  usage: '.tefeci  —  .tefeci ver @kişi <miktar> <faiz> <saat>  —  .tefeci kabul|red  —  .tefeci öde <miktar|hepsi>',
  details: [
    '`.tefeci ver @kişi 100000 20 12` → 100.000 XP, %20 faizle (120.000 geri), 12 saat vadeli teklif.',
    `Borç alan ${TEKLIF_SURESI_MS / 60_000} dk içinde \`.tefeci kabul\` ya da \`.tefeci red\` yazar, kabulde para geçer.`,
    `Faiz tek seferliktir, en çok %${AZAMI_FAIZ}. Vade 1-${AZAMI_VADE_SAATI} saat. En az ${binlik(MIN_TEFECI)} XP.`,
    'Vade dolunca borç cüzdandan ve bankadan otomatik alınır. Yetmezse kalan borç sonradan gelen paradan kesilir.',
    'Kişinin aynı anda tek tefeci borcu olur. `.devret` tefeci borcundan etkilenmez. Kredi borcu olan borç veremez.',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const islem = trLower(args[0] || '')
      const now = Date.now()

      if (['ver', 'teklif', 'borçver', 'borcver'].includes(islem)) {
        const [hedef] = resolveTargets(parsed)
        const sayilar = args.slice(1).filter((a) => /^\d+$/.test(a)).map(Number)
        const [miktar, faiz, saat] = sayilar.slice(-3)
        if (!hedef || sayilar.length < 3) return await yaz(`🦈 ${KULLANIM}`)

        const borclu = uyeKimligiBul(metadata, hedef)
        if (!borclu) return await yaz('❌ Bu kişi grupta bulunamadı.')
        if (borclu === sender) return await yaz('🦈 Kendine borç veremezsin 🙃')
        if (botHesabiMi(borclu)) return await yaz('🤖 Bot borç almaz.')
        if (miktar < MIN_TEFECI) return await yaz(`🦈 En az ${binlik(MIN_TEFECI)} XP borç verilir.`)
        if (faiz > AZAMI_FAIZ) return await yaz(`🦈 Faiz en çok %${AZAMI_FAIZ} olabilir.`)
        if (saat < 1 || saat > AZAMI_VADE_SAATI) return await yaz(`🦈 Vade 1-${AZAMI_VADE_SAATI} saat olmalı.`)

        const s = tefeciTeklif({ chatJid: from, alacakli: sender, borclu, miktar, faiz, saat, now })
        if (!s) return await yaz(KAPALI)
        if (s.borcVar) return await yaz(`🦈 ${mentionOf(borclu)} zaten birine borçlu.`, [borclu])
        if (s.teklifVar) return await yaz(`🦈 ${mentionOf(borclu)} için bekleyen bir teklif var.`, [borclu])
        if (s.borclu) return await yaz('🦈 Kredi borcun ya da eksi bakiyen varken borç veremezsin.')
        if (s.yetersiz) return await yaz(`🦈 O kadar XP'n yok. XP'n: ${binlik(s.xp)}`)

        return await yaz([
          `🦈 ${mentionOf(sender)}, ${mentionOf(borclu)} kişisine borç teklif ediyor:`,
          `💵 ${binlik(miktar)} XP  •  📈 %${faiz} faiz  •  ⏰ ${saat} saat`,
          `💸 Geri ödenecek: ${binlik(s.borc)} XP`,
          '',
          `${mentionOf(borclu)}: \`.tefeci kabul\` ya da \`.tefeci red\` (${TEKLIF_SURESI_MS / 60_000} dk)`,
        ].join('\n'), [sender, borclu])
      }

      if (['kabul', 'evet', 'red', 'ret', 'hayır', 'hayir'].includes(islem)) {
        const kabul = ['kabul', 'evet'].includes(islem)
        const s = tefeciCevap({ chatJid: from, borclu: sender, kabul, now })
        if (!s) return await yaz(KAPALI)
        if (s.yok) return await yaz('🦈 Bekleyen bir borç teklifin yok.')
        if (s.reddedildi) return await yaz(`🦈 ${mentionOf(s.alacakli)}, teklifin reddedildi.`, [s.alacakli])
        if (s.alacakliYetersiz) return await yaz(`🦈 ${mentionOf(s.alacakli)} artık bu parayı veremiyor, teklif düştü.`, [s.alacakli])
        return await yaz([
          `🦈 Anlaşma tamam. ${mentionOf(s.alacakli)} → ${mentionOf(sender)}: ${binlik(s.anapara)} XP`,
          `💸 Borç: ${binlik(s.borc)} XP  •  ⏰ Vade: ${sureYaz(s.vade - now)}`,
          `👛 Cüzdan: ${binlik(s.xp)} XP`,
        ].join('\n'), [s.alacakli, sender])
      }

      if (['öde', 'ode', 'pay'].includes(islem)) {
        const arg = trLower(args[1] || 'hepsi')
        const miktar = ['hepsi', 'tamamı', 'tamami'].includes(arg) ? null : Number(arg)
        if (miktar !== null && !(Number.isSafeInteger(miktar) && miktar > 0)) {
          return await yaz('🦈 Kullanım: `.tefeci öde <miktar|hepsi>`')
        }
        const s = tefeciOde({ chatJid: from, borclu: sender, miktar, now })
        if (!s) return await yaz(KAPALI)
        if (s.yok) return await yaz('🦈 Tefeci borcun yok.')
        if (s.yetersiz) return await yaz(`🦈 Cüzdanında yeterli XP yok. XP'n: ${binlik(s.xp)}`)
        return await yaz([
          `🦈 ${mentionOf(s.alacakli)} kişisine ${binlik(s.odenen)} XP ödendi.`,
          s.kalan > 0 ? `💸 Kalan borç: ${binlik(s.kalan)} XP` : '✅ Borç bitti.',
        ].join('\n'), [s.alacakli])
      }

      if (islem) return await yaz(`🦈 ${KULLANIM}`)

      const d = tefeciDurumu({ chatJid: from, userJid: sender, now })
      if (!d) return await yaz(KAPALI)
      const lines = ['🦈 *Tefeci defterin*', '']
      const mentions = []
      if (d.borc?.durum === 'acik') {
        const gecikti = d.borc.vade <= now
        lines.push(`💸 ${mentionOf(d.borc.alacakli)} kişisine borcun: ${binlik(d.borc.borc)} XP`)
        lines.push(gecikti ? '⚠️ Vade geçti, gelen paran borca kesiliyor.' : `⏰ Vadeye ${sureYaz(d.borc.vade - now)}`)
        mentions.push(d.borc.alacakli)
      } else if (d.borc?.durum === 'teklif') {
        lines.push(`📨 ${mentionOf(d.borc.alacakli)} sana ${binlik(d.borc.anapara)} XP teklif etti (geri: ${binlik(d.borc.borc)}).`)
        lines.push('`.tefeci kabul` ya da `.tefeci red`')
        mentions.push(d.borc.alacakli)
      } else {
        lines.push('💸 Kimseye borcun yok.')
      }
      lines.push('')
      if (d.alacaklar.length) {
        lines.push('💰 *Alacakların*')
        for (const a of d.alacaklar) {
          lines.push(`• ${mentionOf(a.borclu)}: ${binlik(a.borc)} XP${a.vade <= now ? ' (vadesi geçti)' : ` (${sureYaz(a.vade - now)})`}`)
          mentions.push(a.borclu)
        }
      } else {
        lines.push('💰 Alacağın yok.')
      }
      await yaz(lines.join('\n'), mentions)
    } catch (err) {
      logger.error({ err, from }, '.tefeci başarısız')
      await yaz('🦈 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.tefeci hata mesajı gönderilemedi'),
      )
    }
  },
}
