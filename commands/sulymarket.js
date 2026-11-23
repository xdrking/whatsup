import { sureYaz } from './cark.js'
import { oranYaz } from '../lib/banka.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { sulyYaz } from '../lib/kripto.js'
import { ozelUyelikler } from '../lib/ozel.js'
import { binlik } from '../lib/sayi.js'
import { botHesabiMi, firarEt, kalkanKir, karaborsaAl, karaborsaDurumu, maskeTak } from '../lib/stats.js'
import { AZAMI_ADET, HACK_GUNLUK, katliFiyat, kutuMetni, URUNLER, urunKoduyla, urunNotu } from '../lib/sulymarket.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KAPALI = '🕶️ Satıcı ortadan kayboldu, sonra dene.'

const urunSatiri = (u, kat) => `${URUNLER.indexOf(u) + 1}. ${u.ad} — ${binlik(katliFiyat(u.fiyat, kat))} Suly _(${urunNotu(u)})_`

/** Özelden yazılınca kişinin tek ortak grubu kullanılır; birden çoksa hangisi olduğu bilinemez. */
async function baglam({ sock, from, sender, parsed }) {
  if (parsed.isGroup) return { chatJid: from, userJid: sender }
  const uyelikler = await ozelUyelikler(sock, parsed)
  return uyelikler.length === 1 ? uyelikler[0] : null
}

function vitrin(d) {
  const tur = (t) => URUNLER.filter((u) => t.includes(u.tur)).map((u) => urunSatiri(u, d.kat))
  return [
    '🕶️ *SulyMarket*',
    '_Sorular sorulmaz, iade yoktur._',
    ...(d.kat > 1 ? [`📈 Fiyatlar grubun servetine göre anlık: taban x${oranYaz(d.kat)}`] : []),
    '',
    '*Cephane* (çetene girer)',
    ...tur(['silah']),
    '',
    '*Hackerlar* (tek kullanımlık)',
    ...tur(['hacker']),
    '',
    '*Hizmetler*',
    ...tur(['arac', 'duvar', 'kutu']),
    '',
    `🟠 Suly: ${sulyYaz(d.birim)}`,
    ...(d.envanter.length ? [`🎒 ${d.envanter.map((e) => `${urunKoduyla(e.kod)?.ad ?? e.kod} x${e.adet}`).join('  •  ')}`] : []),
    ...(d.duvar ? [`🧱 Duvar: ${sureYaz(d.duvar - Date.now())} kaldı`] : []),
    `💻 Bugünkü hack hakkın: ${d.hackHakki}/${HACK_GUNLUK}`,
    '',
    'Almak: `.sulymarket al <no> [adet]`  •  Suly: `.kripto al suly <miktar>`',
    'Hack: bota özelden `.hack`  •  Baskın: `.çete bas <çete>`  •  NFT: `.nft`',
    'Vurgun: `.vurgun`  •  Offshore: `.offshore`  •  Muhbir: özelden `.muhbir`',
  ].join('\n')
}

async function kullan({ sock, msg, args, from, parsed, yaz, b }) {
  const ad = trLower(args[1] || '')

  if (ad === 'firar') {
    const s = firarEt(b)
    if (!s) return yaz(KAPALI)
    if (s.hapisteDegil) return yaz('🪪 Hapiste değilsin.')
    if (s.yok) return yaz('🪪 Firar planın yok. `.sulymarket`')
    return yaz('🪪 Tünelden çıktın, özgürsün!')
  }

  if (['çilingir', 'cilingir'].includes(ad)) {
    const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!metadata) return
    const [hedef] = resolveTargets(parsed)
    const uye = hedef && uyeKimligiBul(metadata, hedef)
    if (!uye) return yaz('Kullanım: `.sulymarket kullan çilingir @kişi`')
    if (botHesabiMi(uye)) return yaz('🤖 Botun kilidi açılmaz.')

    const s = kalkanKir({ ...b, hedef: uye })
    if (!s) return yaz(KAPALI)
    if (s.kalkanYok) return yaz('🗝️ Bu kişinin kalkanı yok, çilingir harcanmadı.')
    if (s.yok) return yaz('🗝️ Çilingirin yok. `.sulymarket`')
    return yaz(`🗝️ ${mentionOf(uye)} kişisinin kalkanı kırıldı!`, [uye])
  }

  if (['kimlik', 'maske', 'sahte'].includes(ad)) {
    const s = maskeTak(b)
    if (!s) return yaz(KAPALI)
    if (s.yok) return yaz('🎭 Sahte kimliğin yok. `.sulymarket`')
    return yaz(`🎭 Maske takıldı, ${sureYaz(s.bitis - Date.now())} sürer. Bota *özelden* \`.soygun <kimlik>\` yaz, adın görünmez.`)
  }

  return yaz('Kullanım: `.sulymarket kullan firar`  •  `.sulymarket kullan kimlik`  •  `.sulymarket kullan çilingir @kişi`')
}

export default {
  name: 'sulymarket',
  aliases: ['sm', 'karaborsa', 'darkweb'],
  description: 'Suly ile kara borsa: çeteye silah, hacker, VPN, firar planı',
  usage: '.sulymarket  —  .sulymarket al <no> [adet]  —  .sulymarket kullan firar|kimlik  —  .sulymarket kullan çilingir @kişi',
  details: [
    'Fiyatlar anlıktır: grubun en zengin 10 üyesinin serveti büyüdükçe artar, taban fiyatın altına inmez. NFT ve muhbir de aynı.',
    'Her şey Suly ile satılır, ödenen Suly yanar. Bota özelden de yazabilirsin: ne aldığını kimse görmez.',
    'Silahlar çetenin cephaneliğine girer ve orada kalır: baskında güç, üyelere soygunda ek şans verir.',
    'Hacker aldıktan sonra bota *özelden* `.hack` yaz. VPN sonraki saldırıda harcanır: başarıda izini siler, yakalanınca hapse girmezsin.',
    '`.sulymarket kullan kimlik` 1 saatlik maske takar: o sürede özelden `.soygun <kimlik>` yazınca grupta "Maskeli" görünürsün.',
    'Gizemli kutu alındığı an açılır. Polis tuzağı da çıkabilir.',
    '`.sulymarket kullan firar` hapisten kaçırır, `.sulymarket kullan çilingir @ali` Ali\'nin soygun kalkanını kırar.',
    'Güvenlik duvarı alınca başlar, yeniden alınca süresi uzar. Kalkan ve sigorta hackten korumaz.',
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const b = await baglam({ sock, from, sender, parsed })
      if (!b) return await yaz('🕶️ Özelden yalnızca botla tek ortak grubun varsa çalışır. Grupta yaz.')

      const islem = trLower(args[0] || '')
      if (['al', 'satınal', 'satinal', 'buy'].includes(islem)) {
        const urun = URUNLER[Number(args[1]) - 1]
        const adet = args[2] === undefined ? 1 : Number(args[2])
        if (!urun || !Number.isSafeInteger(adet) || adet < 1 || adet > AZAMI_ADET) {
          return await yaz(`🕶️ Ürün numarası yaz: \`.sulymarket al 2 3\` (1-${URUNLER.length})`)
        }
        if (urun.tur === 'kutu' && adet > 1) return await yaz('📦 Kutular tek tek açılır.')

        const s = karaborsaAl({ ...b, urun, adet })
        if (!s) return await yaz(KAPALI)
        if (s.ceteYok) return await yaz('🏴 Silah çeteye alınır, önce bir çeten olmalı: `.çete`')
        if (s.yetersiz) return await yaz(`🕶️ ${sulyYaz(s.ucret)} Suly gerekiyor, sende ${sulyYaz(s.birim)} var. \`.kripto al suly <miktar>\``)
        return await yaz([
          `🕶️ *${urun.ad}${adet > 1 ? ` x${binlik(adet)}` : ''}* teslim edildi, ${sulyYaz(s.ucret)} Suly ödendi.`,
          ...(s.cete ? [`🏴 ${s.cete} cephaneliğine girdi.`] : []),
          ...(s.duvar ? [`🧱 Koruma: ${sureYaz(s.duvar - Date.now())}`] : []),
          ...(s.kutu ? [kutuMetni(s.kutu)] : []),
          ...(urun.kod === 'fidye' ? ['🔒 Kullanmak için bota *özelden* `.hack fidye <kimlik>` yaz.'] : []),
          ...(urun.tur === 'hacker' ? ['💻 Kullanmak için bota *özelden* `.hack` yaz.'] : []),
          `🟠 Kalan: ${sulyYaz(s.birim)} Suly`,
        ].join('\n'))
      }

      if (islem === 'kullan') return await kullan({ sock, msg, args, from, parsed, yaz, b })

      const d = karaborsaDurumu(b)
      await yaz(d ? vitrin(d) : KAPALI)
    } catch (err) {
      logger.error({ err, from }, '.sulymarket başarısız')
      await yaz('🕶️ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.sulymarket hata mesajı gönderilemedi'))
    }
  },
}
