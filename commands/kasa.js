import { ambargoMesaji } from '../lib/devlet.js'
import { requireGroup, requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { kasaBul, KASALAR, kasaYagmuruMetni, odulMetni, RENKLER, tierCoz } from '../lib/sandik.js'
import { ayarDeger } from '../lib/ayarlar.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, sandikAc, sandikAl, sandikDagit, sandikDevret, sandikDurumu } from '../lib/stats.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KAPALI = '🎁 Kasa deposu şu an kapalı, sonra dene.'
const KULLANIM = 'Kullanım: `.kasa`  •  `.kasa aç <1-5>`  •  `.kasa al <1-5> [adet]`  •  `.kasa anahtar <1-5> [adet]`  •  `.kasa devret @kişi kasa|anahtar <1-5> [adet]`'

const turCoz = (k) => (['kasa', 'kasalar', 'sandık', 'sandik'].includes(k) ? 'kasa' : ['anahtar', 'key', 'anahtarlar'].includes(k) ? 'anahtar' : null)
// Adet kısa sayıdır: etiket yerine elle yazılmış numara adet sanılmasın.
const adetCoz = (a) => (/^\d{1,3}$/.test(a ?? '') ? Number(a) : null)

/** `.kasa al` ve `.coinmarket kasa|anahtar` aynı yoldan geçer. */
export async function sandikSatinAl({ from, sender, tur, args, yaz }) {
  const tier = tierCoz(args[0])
  const adet = args[1] === undefined ? 1 : adetCoz(args[1])
  if (!tier || !adet) return yaz(`🎁 Hangi tier? \`.coinmarket ${tur} 3\` ya da \`.coinmarket ${tur} 3 2\` (1-5)`)
  const kasa = kasaBul(tier)
  const s = sandikAl({ chatJid: from, userJid: sender, tur, tier, adet })
  if (!s) return yaz(KAPALI)
  if (s.sinir !== undefined) return yaz(`🎁 Bu hafta coinle en çok ${ayarDeger('kasaHaftalikAlim')} kasa alınır. Kalan hakkın: ${Math.max(0, s.sinir)}`)
  if (s.yetersiz) return yaz(`🪙 ${binlik(s.ucret)} coin gerekiyor, sende ${binlik(s.bakiye)} var.`)
  return yaz([
    `🎁 ${adet} × *${kasa.ad}${tur === 'anahtar' ? ' anahtarı' : ''}* alındı, ${binlik(s.ucret)} coin ödendi.`,
    `🪙 Kalan coin: ${binlik(s.bakiye)}${tur === 'kasa' ? `  •  Bu hafta kalan kasa hakkı: ${s.kalanAlim}` : ''}`,
  ].join('\n'))
}

function durumMetni(d) {
  const satir = (k) => {
    const kasa = d.kasa[k.tier] ?? 0
    const anahtar = d.anahtar[k.tier] ?? 0
    return `T${k.tier} ${k.ad} — kasa *${kasa}*, anahtar *${anahtar}*${kasa && anahtar ? '  ✅ açılabilir' : ''}`
  }
  return [
    '🎁 *Kasaların*',
    ...(d.yeniAnahtar.length ? [`🔑 Gece anahtarın geldi: ${d.yeniAnahtar.map((t) => `T${t}`).join(', ')}`, ''] : ['']),
    ...KASALAR.map(satir),
    '',
    `📅 Bu hafta düşen: kumardan ${d.hafta.kumar}/${ayarDeger('kasaHaftalikKumar')}, soygundan ${d.hafta.soygun}/${ayarDeger('kasaHaftalikSoygun')}  •  coinle alınan: ${d.hafta.alim}/${ayarDeger('kasaHaftalikAlim')}`,
    `🪙 Coin: ${binlik(d.coin)}`,
    '',
    '`.kasa aç 3` aynı tier\'den bir kasa ve bir anahtar harcar. Kasa ve anahtar `.coinmarket`\'te satılır.',
  ].join('\n')
}

export default {
  name: 'kasa',
  aliases: ['kasalar', 'sandık', 'sandik'],
  description: 'CS tarzı kasalar: anahtarla aç, coin, kart, unvan ve NFT çıkar',
  usage: KULLANIM,
  // Sayılar yönetim panelinden değişebildiği için her okumada yeniden yazılır (Faz 90).
  get details() {
    return [
    `5 tier: ${KASALAR.map((k) => `T${k.tier} ${k.ad} (${k.fiyat} coin, anahtarı ${k.anahtar})`).join(', ')}.`,
    ayarDeger('kasaGecelikAnahtar') ? `Her gece herkese 1 rastgele anahtar verilir (\`.kasa\` yazınca gelir, en çok ${ayarDeger('kasaAnahtarBirikme')} gün birikir).` : 'Gecelik bedava anahtar şu an kapalı.',
    `Kasa WhatsApp kumarında kazanınca %${ayarDeger('kasaKumarDusme')}, başarılı soygunda %${ayarDeger('kasaSoygunDusme')} olasılıkla düşer: haftada kumardan ${ayarDeger('kasaHaftalikKumar')}, soygundan ${ayarDeger('kasaHaftalikSoygun')}. Panel kumarında düşmez.`,
    `Coinle haftada en çok ${ayarDeger('kasaHaftalikAlim')} kasa alınır: \`.kasa al 3\` ya da \`.coinmarket kasa 3\`. Anahtar sınırsız: \`.kasa anahtar 3\`.`,
    `Ödülün rengi nadirliğidir: ${Object.values(RENKLER).map((r) => `${r.emoji} ${r.ad}`).join(', ')}. Mistik Kasası'ndan çok düşük olasılıkla Suly NFT'si çıkar.`,
    '`.kasa devret @ali anahtar 2` iki T2 anahtarını Ali\'ye verir. Borçluyken ve ambargodayken devredilemez.',
    'Panelde kasa açılışı animasyonludur: Kumarhane › Kasalar.',
    ]
  },
  category: 'ekonomi',
  cooldown: 3,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed, isOwner }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!(await requireGroup({ sock, msg, from, parsed }))) return
      const islem = trLower(args[0] || '')

      if (['aç', 'ac', 'open'].includes(islem)) {
        const tier = tierCoz(args[1])
        if (!tier) return await yaz('🎁 Hangi kasa? `.kasa aç 3` (1-5)')
        const s = sandikAc({ chatJid: from, userJid: sender, tier })
        if (!s) return await yaz(KAPALI)
        const kasa = kasaBul(tier)
        if (s.kasaYok) return await yaz(`🎁 Sende ${kasa.ad} yok. \`.coinmarket kasa ${tier}\` ile alabilirsin.`)
        if (s.anahtarYok) return await yaz(`🔑 ${kasa.ad} için T${tier} anahtarın yok. \`.coinmarket anahtar ${tier}\` ile alabilirsin.`)
        return await yaz([
          `🎁 *${kasa.ad}* açıldı...`,
          '',
          odulMetni(s.odul, s.sonuc),
          ...(s.sonuc.coin ? [`🪙 Coin: ${binlik(s.coin)}`] : []),
        ].join('\n'))
      }

      // Yalnızca bot sahibi (bot sahibinin isteği). Başkası yazarsa iz bırakmadan düşer, `.help`'te görünmez.
      if (['dağıt', 'dagit'].includes(islem)) {
        if (!isOwner) return
        const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
        if (!metadata) return
        const dagitilan = sandikDagit({ chatJid: from, uyeler: metadata.participants.map((u) => u.id) })
        if (!dagitilan) return await yaz(KAPALI)
        // Herkes etiketlenmez: liste büyük grupta herkese bildirim düşürürdü. Ad düz yazılır.
        return await yaz(kasaYagmuruMetni(dagitilan, displayName))
      }

      if (['al', 'satınal', 'satinal'].includes(islem)) return await sandikSatinAl({ from, sender, tur: 'kasa', args: args.slice(1), yaz })
      if (['anahtar', 'key'].includes(islem)) return await sandikSatinAl({ from, sender, tur: 'anahtar', args: args.slice(1), yaz })

      if (['devret', 'ver'].includes(islem)) {
        const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
        if (!metadata) return
        const kelimeler = args.slice(1).map(trLower).filter((a) => !a.startsWith('@'))
        const tur = kelimeler.map(turCoz).find(Boolean)
        const sayilar = kelimeler.map(adetCoz).filter((n) => n !== null)
        const tier = sayilar[0]
        const adet = sayilar[1] ?? 1
        const [hedefHam] = resolveTargets(parsed)
        if (!hedefHam || !tur || !kasaBul(tier)) return await yaz('Kullanım: `.kasa devret @kişi kasa|anahtar <1-5> [adet]`')
        const hedef = uyeKimligiBul(metadata, hedefHam)
        if (!hedef) return await yaz('❌ Bu kişi grupta bulunamadı.')
        if (hedef === sender) return await yaz('❌ Kendine veremezsin.')
        if (botHesabiMi(hedef)) return await yaz('🤖 Bota verilmez.')
        const s = sandikDevret({ chatJid: from, kaynak: sender, hedef, tur, tier, adet })
        if (!s) return await yaz(KAPALI)
        if (s.ambargo) return await yaz(ambargoMesaji(s.ambargo))
        if (s.borclu) return await yaz('💳 Kredi borcun ya da eksi cüzdanın varken devredemezsin.')
        if (s.yetersiz) return await yaz(`🎁 O kadar T${tier} ${tur} yok. Sende: ${s.adet}`)
        return await yaz(
          `🎁 ${mentionOf(sender)} → ${mentionOf(hedef)}: *${adet} × T${tier} ${tur === 'kasa' ? kasaBul(tier).ad : 'anahtar'}*`,
          [sender, hedef],
        )
      }

      if (islem) return await yaz(KULLANIM)
      const d = sandikDurumu({ chatJid: from, userJid: sender })
      if (!d) return await yaz(KAPALI)
      await yaz(durumMetni(d))
    } catch (err) {
      logger.error({ err, from }, '.kasa başarısız')
      await yaz('🎁 Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.kasa hata mesajı gönderilemedi'))
    }
  },
}
