import { binlik } from '../lib/sayi.js'
import { randomInt } from 'node:crypto'
import { sureYaz } from './cark.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import {
  BASARI_YUZDESI, GUNLUK_DENEME, MIN_HIRSIZ_XP, MIN_KURBAN_XP,
} from '../lib/soygun.js'
import { botHesabiMi, soygunYap, topluSoygun } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { jidNormalizedUser } from '@whiskeysockets/baileys'
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
  const kurbanlar = metadata.participants
    .filter((u) => ![u.id, u.jid, u.lid].some((j) => j && jidNormalizedUser(j) === sender))
    .map((u) => jidNormalizedUser(u.id))
    .filter((jid) => !botHesabiMi(jid))

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

export default {
  name: 'soygun',
  aliases: ['soy', 'rob'],
  description: 'Birinin XP\'sini çalmayı dene — yakalanırsan sen ödersin',
  usage: '.soygun @kişi  —  bir mesajı yanıtlayarak .soygun  —  .soygun herkes',
  details: [
    `Başarı şansı %${BASARI_YUZDESI}. Başarılıysan kurbanın XP'sinin %10'unu alırsın.`,
    'Yakalanırsan kendi XP\'nin %10\'unu kurbana ödersin.',
    `Günde ${GUNLUK_DENEME} deneme. Soyulan kişiye 6 saat dokunulamaz. Kalkan \`.market\`'te satılır.`,
    '`.soygun herkes` gruptaki herkese ayrı ayrı dener, `.coinmarket`\'ten alınan hakla çalışır. Yakalanma cezası yoktur, kalkan yine korur.',
  ],
  category: 'oyun',
  cooldown: 30,
  ownerOnly: false,

  async execute({ sock, msg, args, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      if (trLower(args[0] || '') === 'herkes') return await herkesiSoy({ yaz, from, sender, metadata })

      const [hedef] = resolveTargets(parsed)
      if (!hedef) return await yaz('Kullanım: `.soygun @kişi`')

      const kurban = uyeKimligiBul(metadata, hedef)
      if (!kurban) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (kurban === sender) return await yaz('Kendini soyamazsın 🙃')
      // Sonuç mesajı kurbanın bakiyesini yazar, botunki yalnızca .top'ta görünür.
      if (botHesabiMi(kurban)) return await yaz('🤖 Botun hesabı soyulamaz.')

      const s = soygunYap({
        chatJid: from,
        hirsiz: sender,
        kurban,
        sans: () => randomInt(100) < BASARI_YUZDESI,
      })
      if (!s) return await yaz('🥷 Polis her yerde, sonra dene.')
      if (s.engel) return await yaz(engelMetni(s, kurban), [kurban])

      const taraflar = [sender, kurban]
      await yaz(
        s.basarili
          ? [
              `🥷 *SOYGUN BAŞARILI*`,
              `${mentionOf(sender)}, ${mentionOf(kurban)} kişisinden *${binlik(s.miktar)} XP* çaldı!`,
              ...(s.odul ? [`🎯 Başındaki *${binlik(s.odul)} XP* ödülü de aldı!`] : []),
              `💰 ${binlik(s.hirsizXp)} XP  •  😭 ${binlik(s.kurbanXp)} XP`,
            ].join('\n')
          : [
              `🚓 *YAKALANDIN*`,
              `${mentionOf(sender)}, ${mentionOf(kurban)} kişisine *${binlik(s.miktar)} XP* ceza ödedi.`,
              `💸 ${binlik(s.hirsizXp)} XP  •  😎 ${binlik(s.kurbanXp)} XP`,
            ].join('\n'),
        taraflar,
      )
    } catch (err) {
      logger.error({ err, from }, '.soygun başarısız')
      await yaz('🥷 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.soygun hata mesajı gönderilemedi'),
      )
    }
  },
}
