import { requireGroup, requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { BOZDURMA_YUZDESI } from '../lib/coin.js'
import { ambargoMesaji } from '../lib/devlet.js'
import { EFSANE_KIRA_KATI, KIRA_AZAMI_SAAT, MULKLER, mulkCoz, YUKSELTME_ADEDI, yukseltmeSansi } from '../lib/mulk.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, kiraTopla, mulkAl, mulkDevret, mulkDurumu, mulkSat, mulkYukselt } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KAPALI = '🏠 Tapu şu an kapalı, sonra dene.'
const DEVRET_KULLANIM = 'Kullanım: `.mülk devret @kişi <mülk> [adet]`\nÖrnek: `.mülk devret @ali ev 2`'

async function devret({ sock, msg, from, sender, args, parsed, yaz }) {
  const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
  if (!metadata) return

  const mulk = mulkCoz(args.slice(1))
  // Adet kısa sayıdır: etiket yerine elle yazılmış numara adet sanılmasın.
  const adetHam = args.slice(1).find((a) => /^\d{1,4}$/.test(a))
  const adet = adetHam ? Number(adetHam) : 1
  const [hedefHam] = resolveTargets(parsed)
  if (!hedefHam || !mulk || adet <= 0) return await yaz(DEVRET_KULLANIM)

  const hedef = uyeKimligiBul(metadata, hedefHam)
  if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
  if (hedef === sender) return await yaz('❌ Kendine mülk veremezsin.')
  if (botHesabiMi(hedef)) return await yaz('🤖 Bota mülk verilmez.')

  const s = mulkDevret({ chatJid: from, kaynak: sender, hedef, mulk, adet })
  if (!s) return await yaz(KAPALI)
  if (s.ambargo) return await yaz(ambargoMesaji(s.ambargo))
  if (s.borclu) return await yaz('💳 Kredi borcun ya da eksi cüzdanın varken mülk devredilemez.')
  if (s.yetersiz) return await yaz(`🏠 O kadar ${mulk.ad} yok. Sende: ${s.adet}`)

  await sock.sendMessage(from, {
    text: [
      `🏠 ${mentionOf(sender)} → ${mentionOf(hedef)}: *${adet} ${mulk.ad}*`,
      ...(s.kira ? [`💵 Birikmiş kira sana ödendi: +${binlik(s.kira)} XP`] : []),
      `${mentionOf(sender)}: ${s.kaynakAdet} tane`,
      `${mentionOf(hedef)}: ${s.hedefAdet} tane`,
    ].join('\n'),
    mentions: [sender, hedef],
  }, { quoted: msg })
}

const kiraYaz = (m) => (m.kiraYuzde ? `saatlik kira %${String(m.kiraYuzde).replace('.', ',')}` : 'kira yok')
const YUKSELT_KULLANIM = `Kullanım: \`.mülk yükselt <mülk> [1-${YUKSELTME_ADEDI}]\`\nÖrnek: \`.mülk yükselt dükkan 4\` (kesin)  •  \`.mülk yükselt dükkan 2\` (%${yukseltmeSansi(2)})`

async function yukselt({ from, sender, args, yaz }) {
  const mulk = mulkCoz(args.slice(1))
  const adetHam = args.slice(1).find((a) => /^\d{1,2}$/.test(a))
  const adet = adetHam ? Number(adetHam) : YUKSELTME_ADEDI
  if (!mulk || adet < 1 || adet > YUKSELTME_ADEDI) return await yaz(YUKSELT_KULLANIM)

  const s = mulkYukselt({ chatJid: from, userJid: sender, mulk, adet })
  if (!s) return await yaz(KAPALI)
  if (s.efsaneYok) return await yaz('✨ Efsanevi mülk daha fazla yükseltilmez.')
  if (s.yetersiz) return await yaz(`🏠 ${adet} tane ${mulk.ad} gerekiyor. Sende: ${s.adet}`)
  return await yaz([
    `🎰 ${adet} ${mulk.ad} masaya kondu, şans %${s.sans}...`,
    s.basarili
      ? `✨ *TUTTU!* ${s.efsane.ad} senin! (${s.efsaneAdet} tane, ${kiraYaz(s.efsane)})`
      : `💥 Tutmadı, ${adet} ${mulk.ad} yandı.`,
    ...(s.kira ? [`💵 Birikmiş kira ödendi: +${binlik(s.kira)} XP`] : []),
    `🏠 Kalan ${mulk.ad}: ${s.kalan}`,
  ].join('\n'))
}

export default {
  name: 'mülk',
  aliases: ['mulk', 'emlak'],
  description: 'Coinle mülk al, kira topla',
  usage: '.mülk  —  .mülk al <mülk>  —  .mülk sat <mülk>  —  .mülk topla  —  .mülk devret @kişi <mülk> [adet]  —  .mülk yükselt <mülk> [adet]',
  details: [
    'Mülk coinle alınır. Kira saat başı birikir ve coin kuruna bağlıdır, enflasyonda büyür.',
    `Kira ${KIRA_AZAMI_SAAT} saatte durur, \`.mülk topla\` yazmak gerekir.`,
    '`.mülk devret @ali ev 2` — iki evini Ali\'ye verir. Birikmiş kira sende kalır. Borçluyken devredilemez, bota verilmez.',
    `Satış coin kurunun %${BOZDURMA_YUZDESI}'inden XP olarak ödenir. Owner \`.haciz @kişi ev\` ile mülke el koyabilir.`,
    `*Efsanevi mülk* satın alınmaz. \`.mülk yükselt dükkan\` ${YUKSELTME_ADEDI} dükkanı koyar, kesin bir Efsanevi Dükkan gelir: ${YUKSELTME_ADEDI} dükkan değerinde, kira yüzdesi ${EFSANE_KIRA_KATI} katı.`,
    `Daha az da konabilir: tanesi %${yukseltmeSansi(1)} şans. \`.mülk yükselt dükkan 2\` %${yukseltmeSansi(2)} tutar, tutmazsa iki dükkan yanar.`,
    'Efsanevi mülk adıyla satılır ve devredilir: `.mülk sat efsane dükkan`.',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return

      const islem = trLower(args[0] || '')

      if (islem === 'topla') {
        const s = kiraTopla({ chatJid: from, userJid: sender })
        if (!s) return await yaz(KAPALI)
        if (!s.kira) return await yaz('🏠 Toplanacak kira yok.')
        return await yaz(`🏠 Kira toplandı: *+${binlik(s.kira)} XP*\n💰 XP'n: ${binlik(s.xp)}`)
      }

      if (islem === 'devret' || islem === 'ver') return await devret({ sock, msg, from, sender, args, parsed, yaz })
      if (['yükselt', 'yukselt', 'up', 'tradeup'].includes(islem)) return await yukselt({ from, sender, args, yaz })

      if (islem === 'al' || islem === 'sat') {
        const mulk = mulkCoz(args.slice(1))
        if (!mulk) return await yaz(`🏠 Hangi mülk? ${MULKLER.filter((m) => !m.efsane).map((m) => `\`${m.adlar[0]}\``).join(', ')}`)

        if (islem === 'al') {
          const s = mulkAl({ chatJid: from, userJid: sender, mulk })
          if (!s) return await yaz(KAPALI)
          if (s.satilmaz) return await yaz(`✨ ${mulk.ad} satın alınmaz, yükseltmeyle çıkar: \`.mülk yükselt ${mulk.taban}\``)
          if (s.yetersiz) return await yaz(`🏠 ${mulk.fiyat} coin gerekiyor. Senin coinin: ${binlik(s.bakiye)}`)
          return await yaz(`🏠 *${mulk.ad}* senin! (${s.adet} tane)\n🪙 Kalan coin: ${binlik(s.bakiye)}`)
        }

        const s = mulkSat({ chatJid: from, userJid: sender, mulk })
        if (!s) return await yaz(KAPALI)
        if (s.yok) return await yaz(`🏠 Sende ${mulk.ad} yok.`)
        return await yaz([
          `🏠 *${mulk.ad}* satıldı: +${binlik(s.kazanc)} XP`,
          ...(s.kira ? [`💵 Birikmiş kira: +${binlik(s.kira)} XP`] : []),
          `💰 XP'n: ${binlik(s.xp)}`,
        ].join('\n'))
      }

      const mulkler = mulkDurumu({ chatJid: from, userJid: sender })
      await yaz([
        '🏠 *Emlak*',
        '',
        ...MULKLER.filter((m) => !m.efsane).map((m) => `${m.ad} — ${m.fiyat} coin, ${kiraYaz(m)}`),
        '',
        `*Efsanevi* (satılmaz, \`.mülk yükselt\` ile ${YUKSELTME_ADEDI} taneden çıkar)`,
        ...MULKLER.filter((m) => m.efsane).map((m) => `${m.ad} — ${m.fiyat} coin değerinde, ${kiraYaz(m)}`),
        '',
        ...(mulkler.length
          ? ['*Mülklerin*', ...mulkler.map((m) => `${m.mulk.ad} x${m.adet}${m.kira ? ` — ${binlik(m.kira)} XP kira` : ''}`), '']
          : []),
        'Kullanım: `.mülk al ev`  •  `.mülk sat ev`  •  `.mülk topla`  •  `.mülk devret @kişi ev`  •  `.mülk yükselt ev 4`',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.mülk başarısız')
      await yaz('🏠 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.mülk hata mesajı gönderilemedi'),
      )
    }
  },
}
