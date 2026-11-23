import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import { sureYaz } from './cark.js'
import { grupIdCoz, numaraCoz } from './xpver.js'
import { digerUyeler, requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import {
  BASARI_YUZDESI, GUNLUK_DENEME, MIN_HIRSIZ_XP, MIN_KURBAN_XP,
} from '../lib/soygun.js'
import { HAPIS_SAATI } from '../lib/hapis.js'
import { isMuted } from '../lib/mute.js'
import { cokGrupMetni, HEDEF_YOK, ozelHedefler, ozelUyelikler } from '../lib/ozel.js'
import { botHesabiMi, ceteSoygunBonusu, hapisDurumu, maskeBitisi, soygunYap, topluSoygun } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

function engelMetni({ engel, bitis }, kurban) {
  const kalan = bitis ? sureYaz(bitis - Date.now()) : ''
  if (engel === 'hak') return `🥷 Bugünlük ${GUNLUK_DENEME} soygun hakkın bitti.`
  if (engel === 'kalkan') return `🛡️ ${mentionOf(kurban)} kalkan almış (${kalan} kaldı).`
  if (engel === 'korunma') return `🚓 ${mentionOf(kurban)} yeni soyuldu, ${kalan} dokunulamaz.`
  if (engel === 'kurban-fakir') return `🥷 ${mentionOf(kurban)} kişisinde çalacak bir şey yok (en az ${MIN_KURBAN_XP} XP).`
  return `🥷 Soygun için en az ${MIN_HIRSIZ_XP} XP'n olmalı, yakalanırsan ceza ödeyeceksin.`
}

async function herkesiSoy({ yaz, from, sender, metadata }) {
  const kurbanlar = digerUyeler(metadata, sender).filter((jid) => !botHesabiMi(jid))

  const s = topluSoygun({
    chatJid: from,
    hirsiz: sender,
    kurbanlar,
    sans: () => randomInt(100) < BASARI_YUZDESI,
  })
  if (!s) return yaz('🥷 Polis her yerde, sonra dene.')
  if (s.hakYok) return yaz('💣 Toplu soygun hakkın yok. `.coinmarket`\'ten 2 coine alınır.')
  if (s.hedefYok) return yaz('💣 Soyulacak kimse yok: herkes kalkanlı, korumada ya da fakir. Hakkın yanmadı.')

  return yaz(
    [
      `💣 *TOPLU SOYGUN*  •  ${mentionOf(sender)}`,
      '',
      ...s.soyulanlar.map((k) => `💸 ${mentionOf(k.jid)} — ${binlik(k.miktar)} XP${k.odul ? ` + ${binlik(k.odul)} XP ödül` : ''}`),
      ...s.kacanlar.map((jid) => `🏃 ${mentionOf(jid)} kaçtı`),
      '',
      `💰 Toplam *${binlik(s.toplam)} XP*  •  XP'n: ${binlik(s.xp)}`,
    ].join('\n'),
    [sender, ...s.soyulanlar.map((k) => k.jid), ...s.kacanlar],
  )
}

function sonucMetni(s, hirsiz, kurban) {
  return s.basarili
    ? [
        `🥷 *SOYGUN BAŞARILI*`,
        `${mentionOf(hirsiz)}, ${mentionOf(kurban)} kişisinden *${binlik(s.miktar)} XP* çaldı!`,
        ...(s.odul ? [`🎯 Başındaki *${binlik(s.odul)} XP* ödülü de aldı!`] : []),
        `💰 ${binlik(s.hirsizXp)} XP  •  😭 ${binlik(s.kurbanXp)} XP`,
      ].join('\n')
    : [
        `🚓 *YAKALANDIN*`,
        `${mentionOf(hirsiz)}, ${mentionOf(kurban)} kişisine *${binlik(s.miktar)} XP* ceza ödedi.`,
        `💸 ${binlik(s.hirsizXp)} XP  •  😎 ${binlik(s.kurbanXp)} XP`,
        `🚔 ${HAPIS_SAATI} saat hapis. Kefalet: ${binlik(s.hapis.kefalet)} XP (\`.kefalet\`)`,
      ].join('\n')
}

/**
 * Sahte kimlikli soygun özelden yazılır: komut grupta yazılsaydı maskenin anlamı kalmazdı. Sonuç gruba duyurulur
 * (`.hack` gibi); başarıda hırsız "Maskeli", yakalanınca maske düşer.
 */
async function maskeliSoygun({ sock, yaz, args, parsed }) {
  const maskeliler = (await ozelUyelikler(sock, parsed)).filter((u) => maskeBitisi(u.chatJid, u.userJid))
  if (!maskeliler.length) return yaz('🎭 Özelden soygun için sahte kimlik gerekir: `.sulymarket kullan kimlik`. Maskesiz soygun grupta yapılır.')

  const grupArg = args.find((a) => a.endsWith('@g.us'))
  const kimlik = numaraCoz(args.filter((a) => a !== grupArg).join(' '))
  if (!kimlik) return yaz('Kullanım (özelden): `.soygun <numara ya da id>`')
  const adaylar = await ozelHedefler(sock, maskeliler, kimlik, grupArg ? grupIdCoz(grupArg) : null)
  if (!adaylar.length) return yaz(HEDEF_YOK)
  if (adaylar.length > 1) return yaz(cokGrupMetni(adaylar))

  const [{ chatJid, userJid, hedef }] = adaylar
  const hapis = hapisDurumu(chatJid, userJid)
  if (hapis) return yaz(`🚔 Hapistesin, ${sureYaz(hapis.bitis - Date.now())} kaldı.`)
  if (hedef === userJid) return yaz('Kendini soyamazsın 🙃')
  if (botHesabiMi(hedef)) return yaz('🤖 Botun hesabı soyulamaz.')

  const bonus = ceteSoygunBonusu(chatJid, userJid)
  const s = soygunYap({ chatJid, hirsiz: userJid, kurban: hedef, sans: () => randomInt(100) < BASARI_YUZDESI + bonus })
  if (!s) return yaz('🥷 Polis her yerde, sonra dene.')
  if (s.engel) return yaz(engelMetni(s, hedef), [hedef])

  await yaz(sonucMetni(s, userJid, hedef), [userJid, hedef])
  if (isMuted(chatJid)) return
  const duyuru = s.basarili
    ? `🎭 *MASKELİ SOYGUN*\nMaskeli biri ${mentionOf(hedef)} kişisinden *${binlik(s.miktar)} XP* çaldı!`
    : `🎭 Maske düştü!\n${sonucMetni(s, userJid, hedef)}`
  await sock.sendMessage(chatJid, { text: duyuru, mentions: s.basarili ? [hedef] : [userJid, hedef] })
}

export default {
  name: 'soygun',
  aliases: ['soy', 'rob'],
  description: 'Birinin XP\'sini çalmayı dene — yakalanırsan sen ödersin',
  usage: '.soygun @kişi  —  bir mesajı yanıtlayarak .soygun  —  .soygun herkes',
  details: [
    `Başarı şansı %${BASARI_YUZDESI}, çetenin silahları artırır (\`.sulymarket\`). Başarılıysan kurbanın XP'sinin %10'unu alırsın.`,
    `Yakalanırsan kendi XP'nin %10'unu kurbana ödersin ve ${HAPIS_SAATI} saat hapse girersin (\`.kefalet\`).`,
    `Günde ${GUNLUK_DENEME} deneme. Soyulan kişiye 6 saat dokunulamaz. Kalkan \`.market\`'te satılır.`,
    'Sahte kimlik (`.sulymarket`) takılıyken bota özelden `.soygun <kimlik>` yaz: grupta "Maskeli" görünürsün, yakalanırsan maske düşer.',
    '`.soygun herkes` gruptaki herkese ayrı ayrı dener, `.coinmarket`\'ten alınan hakla çalışır. Yakalanma cezası yoktur, kalkan yine korur.',
  ],
  category: 'toplum',
  cooldown: 30,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      if (!parsed.isGroup) return await maskeliSoygun({ sock, yaz, args, parsed })

      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const hapis = hapisDurumu(from, sender)
      if (hapis) return await yaz(`🚔 Hapistesin, ${sureYaz(hapis.bitis - Date.now())} kaldı. Çıkmak için \`.kefalet\``)

      if (trLower(args[0] || '') === 'herkes') return await herkesiSoy({ yaz, from, sender, metadata })

      const [hedef] = resolveTargets(parsed)
      if (!hedef) return await yaz('Kullanım: `.soygun @kişi`')

      const kurban = uyeKimligiBul(metadata, hedef)
      if (!kurban) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (kurban === sender) return await yaz('Kendini soyamazsın 🙃')
      // Sonuç mesajı kurbanın bakiyesini yazar, botunki yalnızca .top'ta görünür.
      if (botHesabiMi(kurban)) return await yaz('🤖 Botun hesabı soyulamaz.')

      const bonus = ceteSoygunBonusu(from, sender)
      const s = soygunYap({
        chatJid: from,
        hirsiz: sender,
        kurban,
        sans: () => randomInt(100) < BASARI_YUZDESI + bonus,
      })
      if (!s) return await yaz('🥷 Polis her yerde, sonra dene.')
      if (s.engel) return await yaz(engelMetni(s, kurban), [kurban])

      await yaz(sonucMetni(s, sender, kurban), [sender, kurban])
    } catch (err) {
      logger.error({ err, from }, '.soygun başarısız')
      await yaz('🥷 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.soygun hata mesajı gönderilemedi'),
      )
    }
  },
}
