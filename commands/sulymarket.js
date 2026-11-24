import { sureYaz } from './cark.js'
import { oranYaz } from '../lib/banka.js'
import { digerUyeler, groupMetadata, requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { sulyYaz } from '../lib/kripto.js'
import { hedefBul, ozelUyelikler } from '../lib/ozel.js'
import { isMuted } from '../lib/mute.js'
import { botGonderisi } from '../lib/sosyal.js'
import { numaraCoz } from './xpver.js'
import { binlik } from '../lib/sayi.js'
import {
  botHesabiMi, casusRaporu, duvarYak, firarEt, kalkanKir, karaborsaAl, karaborsaDurumu, korsanYayin, mantikKur, maskeTak, pasaportKullan,
  rusvetVer, sahteIhbar,
} from '../lib/stats.js'
import {
  AZAMI_ADET, HACK_GUNLUK, IHBAR_SAATI, katliFiyat, KORSAN_AZAMI, kutuMetni, MANTIK_YUZDE, URUNLER, urunKoduyla, urunNotu, ZAR_SANSI,
} from '../lib/sulymarket.js'
import { displayName, mentionOf, resolveTargets } from '../lib/target.js'
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
    ...tur(['arac', 'duvar', 'zar', 'sure', 'kutu']),
    '',
    `🟠 Suly: ${sulyYaz(d.birim)}`,
    ...(d.envanter.length ? [`🎒 ${d.envanter.map((e) => `${urunKoduyla(e.kod)?.ad ?? e.kod} x${e.adet}`).join('  •  ')}`] : []),
    ...(d.duvar ? [`🧱 Duvar: ${sureYaz(d.duvar - Date.now())} kaldı`] : []),
    ...(d.zar ? [`🎲 Hileli zar: ${sureYaz(d.zar - Date.now())} kaldı`] : []),
    ...(d.etkiler ?? []).map((e) => `${urunKoduyla(e.kod).ad}: ${sureYaz(e.bitis - Date.now())} kaldı`),
    `💻 Bugünkü hack hakkın: ${d.hackHakki}/${HACK_GUNLUK}`,
    '',
    'Almak: `.sulymarket al <no> [adet]`  •  Suly: `.kripto al suly <miktar>`',
    'Hack: bota özelden `.hack`  •  Baskın: `.çete bas <çete>`  •  NFT: `.nft`',
    'Vurgun: `.vurgun`  •  Offshore: `.offshore`  •  Muhbir: özelden `.muhbir`',
  ].join('\n')
}

/**
 * Özelden kullanılan ürünlerin (casus, mantık bombası) hedefi: kimlik yazılmazsa gruptaki kimlikler listelenir,
 * grupta `.id @kişi` yazıp hedef belli edilmesin. @returns {Promise<string | null>} hedef; liste yazıldıysa null
 */
async function ozelHedef({ sock, args, yaz, b, ornek }) {
  const metadata = await groupMetadata(sock, b.chatJid)
  const kimlik = numaraCoz(args.slice(2).join(' '))
  const hedef = kimlik && hedefBul(metadata, kimlik)
  if (hedef && !botHesabiMi(hedef)) return hedef
  const satirlar = digerUyeler(metadata, b.userJid).filter((j) => !botHesabiMi(j))
    .map((j) => `• ${displayName(j)} — \`${j.endsWith('@lid') ? j : j.split('@')[0]}\``)
  await yaz([kimlik ? '❌ Bu kimlik grupta bulunamadı.' : '🎯 Hedefin kimliğini yaz:', ...satirlar, '', `Örnek: \`${ornek}\``].join('\n'))
  return null
}

const OZELDEN = (ornek) => `🤫 Bunu grupta mı yapacaksın? Bota *özelden* yaz: \`${ornek}\``

async function kullan({ sock, msg, args, text, from, parsed, yaz, b }) {
  const ad = trLower(args[1] || '')

  if (['casus', 'casusyazılım', 'casusyazilim'].includes(ad)) {
    if (parsed.isGroup) return yaz(OZELDEN('.sulymarket kullan casus <kimlik>'))
    const hedef = await ozelHedef({ sock, args, yaz, b, ornek: '.sulymarket kullan casus 905551234567' })
    if (!hedef) return
    const s = casusRaporu({ ...b, hedef })
    if (!s) return yaz(KAPALI)
    if (s.kendin) return yaz('🕵️ Kendini mi izleyeceksin?')
    if (s.yok) return yaz('🕵️ Casus yazılımın yok. `.sulymarket`')
    const kalan = (t) => sureYaz(t - Date.now())
    return yaz([
      `🕵️ *GİZLİ RAPOR* — ${displayName(hedef)}`,
      `👛 Cüzdan: ${binlik(s.cuzdan)} XP`,
      `🏦 Banka: ${binlik(s.banka)} XP`,
      `🪙 Coin: ${binlik(s.coin)}  •  🟠 Suly: ${sulyYaz(s.suly)}`,
      `🏠 Mülk: ${s.mulk}  •  🖼️ NFT: ${s.nft}`,
      s.duvar ? `🧱 Güvenlik duvarı: ${kalan(s.duvar)}` : '🧱 Güvenlik duvarı: yok',
      ...(s.korunma ? [`🚨 Yeni hacklenmiş, ${kalan(s.korunma)} izleniyor`] : []),
      ...(s.soguk ? [`🔐 Soğuk cüzdan: ${kalan(s.soguk)} (coin ve NFT alınamaz)`] : []),
      ...(s.fidye ? ['🔒 Bankası fidyeyle kilitli'] : []),
    ].join('\n'))
  }

  if (['mantık', 'mantik', 'mantıkbombası', 'mantikbombasi'].includes(ad)) {
    if (parsed.isGroup) return yaz(OZELDEN('.sulymarket kullan mantık <kimlik>'))
    const hedef = await ozelHedef({ sock, args, yaz, b, ornek: '.sulymarket kullan mantık 905551234567' })
    if (!hedef) return
    const s = mantikKur({ ...b, hedef })
    if (!s) return yaz(KAPALI)
    if (s.kendin) return yaz('💣 Kendine bomba kurulmaz.')
    if (s.zatenVar) return yaz('💣 Bu kişinin sisteminde zaten bir bomba var.')
    if (s.yok) return yaz('💣 Mantık bomban yok. `.sulymarket`')
    return yaz(`💣 Bomba ${displayName(hedef)} kişisinin bankasına yerleşti. Bir sonraki çekiminin %${MANTIK_YUZDE}'u senin bankana akacak (en geç ${sureYaz(s.kuruldu - Date.now())}).`)
  }

  if (['korsan', 'korsanyayın', 'korsanyayin', 'yayın', 'yayin'].includes(ad)) {
    if (parsed.isGroup) return yaz(OZELDEN('.sulymarket kullan korsan <mesaj>'))
    const metin = String(text || '').trim().replace(/^\S+\s+\S+\s*/, '').trim()
    if (!metin) return yaz('📢 Ne yayınlanacak? `.sulymarket kullan korsan Hazinede bir şeyler dönüyor...`')
    if (metin.length > KORSAN_AZAMI) return yaz(`📢 En çok ${KORSAN_AZAMI} karakter.`)
    if (isMuted(b.chatJid)) return yaz('📢 Grup susturulmuş, yayın gitmez. Bir şey harcanmadı.')
    const s = korsanYayin(b)
    if (!s) return yaz(KAPALI)
    if (s.bekle) return yaz(`📢 Verici soğuyor, ${sureYaz(s.bekle - Date.now())} sonra.`)
    if (s.yok) return yaz('📢 Korsan yayının yok. `.sulymarket`')
    await sock.sendMessage(b.chatJid, { text: `📢 *KORSAN YAYIN*\n_Kaynağı bilinmeyen bir sinyal yayına girdi:_\n\n${metin}` })
    botGonderisi(b.chatJid, `📢 Korsan yayın: ${metin}`)
    return yaz('📢 Yayın gitti. Kimse senin olduğunu bilmiyor.')
  }

  if (['ihbar', 'sahteihbar'].includes(ad)) {
    const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!metadata) return
    const [hedefHam] = resolveTargets(parsed)
    const hedef = hedefHam && uyeKimligiBul(metadata, hedefHam)
    if (!hedef) return yaz('Kullanım: `.sulymarket kullan ihbar @kişi`')
    if (botHesabiMi(hedef)) return yaz('🤖 Botu kimse içeri atamaz.')
    const s = sahteIhbar({ ...b, hedef })
    if (!s) return yaz(KAPALI)
    if (s.kendin) return yaz('🚔 Kendini mi ihbar edeceksin?')
    if (s.zatenHapiste) return yaz('🚔 Zaten içeride, ihbar harcanmadı.')
    if (s.yok) return yaz('🚔 Sahte ihbarın yok. `.sulymarket`')
    if (s.yakalandin) return yaz(`🚨 İhbar sahte çıktı, polis seni aldı! ${sureYaz(s.yakalandin.bitis - Date.now())} hapis. Kefalet: ${binlik(s.yakalandin.kefalet)} XP`)
    return yaz(`🚔 İhbar üzerine ${mentionOf(hedef)} gözaltına alındı (${IHBAR_SAATI * 60} dk). Kefalet: ${binlik(s.gozalti.kefalet)} XP${s.vpn ? '\n🛰️ VPN harcandı, ihbarın izi yok.' : ''}`, [hedef])
  }

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

  if (['emp'].includes(ad)) {
    const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!metadata) return
    const [hedef] = resolveTargets(parsed)
    const uye = hedef && uyeKimligiBul(metadata, hedef)
    if (!uye) return yaz('Kullanım: `.sulymarket kullan emp @kişi`')
    const s = duvarYak({ ...b, hedef: uye })
    if (!s) return yaz(KAPALI)
    if (s.duvarYok) return yaz('⚡ Bu kişinin güvenlik duvarı yok, EMP harcanmadı.')
    if (s.yok) return yaz('⚡ EMP bomban yok. `.sulymarket`')
    return yaz(`⚡ ${mentionOf(uye)} kişisinin güvenlik duvarı yandı!`, [uye])
  }

  if (['rüşvet', 'rusvet'].includes(ad)) {
    const s = rusvetVer(b)
    if (!s) return yaz(KAPALI)
    if (s.dosyaYok) return yaz('💼 Hakkında açık dosya yok, rüşvet harcanmadı.')
    if (s.yok) return yaz('💼 Rüşvet çantan yok. `.sulymarket`')
    return yaz(`💼 Çanta masaya bırakıldı. ${s.silinen} dosya "kayboldu", \`.izsür\` seni bulamaz.`)
  }

  if (['pasaport', 'sahtepasaport'].includes(ad)) {
    const s = pasaportKullan(b)
    if (!s) return yaz(KAPALI)
    if (s.ambargoYok) return yaz('🛂 Ambargon yok, pasaport harcanmadı.')
    if (s.yok) return yaz('🛂 Sahte pasaportun yok. `.sulymarket`')
    return yaz('🛂 Yeni kimlikle sınırı geçtin, ambargo kalktı.')
  }

  if (['kimlik', 'maske', 'sahte'].includes(ad)) {
    const s = maskeTak(b)
    if (!s) return yaz(KAPALI)
    if (s.yok) return yaz('🎭 Sahte kimliğin yok. `.sulymarket`')
    return yaz(`🎭 Maske takıldı, ${sureYaz(s.bitis - Date.now())} sürer. Bota *özelden* \`.soygun <kimlik>\` yaz, adın görünmez.`)
  }

  return yaz('Kullanım: `.sulymarket kullan firar|kimlik|rüşvet|pasaport`  •  `kullan çilingir|emp|ihbar @kişi`  •  özelden: `kullan casus|mantık <kimlik>`, `kullan korsan <mesaj>`')
}

export default {
  name: 'sulymarket',
  aliases: ['sm', 'karaborsa', 'darkweb'],
  description: 'Suly ile kara borsa: çeteye silah, hacker, VPN, firar planı',
  usage: '.sulymarket  —  .sulymarket al <no> [adet]  —  .sulymarket kullan firar|kimlik|rüşvet|pasaport  —  .sulymarket kullan çilingir|emp|ihbar @kişi  —  özelden: kullan casus|mantık <kimlik>, kullan korsan <mesaj>',
  details: [
    'Fiyatlar anlıktır: grubun en zengin 10 üyesinin serveti büyüdükçe artar, taban fiyatın altına inmez. NFT ve muhbir de aynı.',
    'Her şey Suly ile satılır, ödenen Suly yanar. Bota özelden de yazabilirsin: ne aldığını kimse görmez.',
    'Silahlar çetenin cephaneliğine girer ve orada kalır: baskında güç, üyelere soygunda ek şans verir.',
    'Hacker aldıktan sonra bota *özelden* `.hack` yaz. VPN sonraki saldırıda harcanır: başarıda izini siler, yakalanınca hapse girmezsin.',
    '`.sulymarket kullan kimlik` 1 saatlik maske takar: o sürede özelden `.soygun <kimlik>` yazınca grupta "Maskeli" görünürsün.',
    'Gizemli kutu alındığı an açılır. Polis tuzağı da çıkabilir.',
    '`.sulymarket kullan firar` hapisten kaçırır, `.sulymarket kullan çilingir @ali` Ali\'nin soygun kalkanını kırar.',
    'Güvenlik duvarı alınca başlar, 24 saat sürer, bitmeden yenisi alınmaz. Zero-day duvarı deler, elit %50 deler (delemezse hacker yanar). Kalkan ve sigorta hackten korumaz.',
    '`.sulymarket kullan emp @ali` Ali\'nin duvarını yakar. `kullan rüşvet` hakkındaki açık hack dosyalarını sildirir, `kullan pasaport` ambargoyu kaldırır.',
    '`kullan casus <kimlik>` (özelden) hedefin parasını ve korumalarını raporlar. `kullan mantık <kimlik>` (özelden) hedefin sonraki banka çekiminden pay alır.',
    '`kullan ihbar @ali` Ali\'yi kısa gözaltına aldırır; VPN\'in yoksa sen yakalanabilirsin. `kullan korsan <mesaj>` (özelden) gruba adsız duyuru yapar, günde bir.',
    'Kimlik hırsızlığı ve nazar boncuğu kendiliğinden işler: başarılı hack ya da fidyede suç başkasına atılır, kaybettiğin bahsin yarısı geri gelir. Soğuk cüzdan ve ayarlı makine alındığı an başlar.',
    `Hileli zar alındığı an başlar: süresi boyunca tek elde biten kumarda (bahis, slot, rulet, kazı, plinko, crash; panelde de) kaybeden el %${ZAR_SANSI} olasılıkla yeniden atılır. Bitmeden yenisi alınmaz.`,
  ],
  category: 'ekonomi',
  cooldown: 5,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, args, text, parsed }) {
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
        if (['duvar', 'zar', 'sure'].includes(urun.tur) && adet > 1) return await yaz(`${urun.ad} tek tek alınır.`)

        const s = karaborsaAl({ ...b, urun, adet })
        if (!s) return await yaz(KAPALI)
        if (s.ceteYok) return await yaz('🏴 Silah çeteye alınır, önce bir çeten olmalı: `.çete`')
        if (s.suruyor) return await yaz(`${urun.ad} hâlâ sürüyor, ${sureYaz(s.suruyor - Date.now())} kaldı. Bitince yenisini alabilirsin.`)
        if (s.yetersiz) return await yaz(`🕶️ ${sulyYaz(s.ucret)} Suly gerekiyor, sende ${sulyYaz(s.birim)} var. \`.kripto al suly <miktar>\``)
        return await yaz([
          `🕶️ *${urun.ad}${adet > 1 ? ` x${binlik(adet)}` : ''}* teslim edildi, ${sulyYaz(s.ucret)} Suly ödendi.`,
          ...(s.cete ? [`🏴 ${s.cete} cephaneliğine girdi.`] : []),
          ...(s.duvar ? [`🧱 Koruma: ${sureYaz(s.duvar - Date.now())}`] : []),
          ...(s.zar ? [`🎲 Zar ${sureYaz(s.zar - Date.now())} hileli. Kumarhaneye koş.`] : []),
          ...(s.sure ? [`⏳ ${sureYaz(s.sure - Date.now())} sürecek.`] : []),
          ...(s.kutu ? [kutuMetni(s.kutu)] : []),
          ...(urun.kod === 'fidye' ? ['🔒 Kullanmak için bota *özelden* `.hack fidye <kimlik>` yaz.'] : []),
          ...(urun.tur === 'hacker' ? ['💻 Kullanmak için bota *özelden* `.hack` yaz.'] : []),
          `🟠 Kalan: ${sulyYaz(s.birim)} Suly`,
        ].join('\n'))
      }

      if (islem === 'kullan') return await kullan({ sock, msg, args, text, from, parsed, yaz, b })

      const d = karaborsaDurumu(b)
      await yaz(d ? vitrin(d) : KAPALI)
    } catch (err) {
      logger.error({ err, from }, '.sulymarket başarısız')
      await yaz('🕶️ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.sulymarket hata mesajı gönderilemedi'))
    }
  },
}
