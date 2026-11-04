import { randomInt } from 'node:crypto'
import { sureYaz } from './cark.js'
import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import {
  BASARI_YUZDESI, GUNLUK_DENEME, MIN_HIRSIZ_XP, MIN_KURBAN_XP,
} from '../lib/soygun.js'
import { soygunYap } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import logger from '../lib/logger.js'

function engelMetni({ engel, bitis }, kurban) {
  const kalan = bitis ? sureYaz(bitis - Date.now()) : ''
  if (engel === 'hak') return `🥷 Bugünlük ${GUNLUK_DENEME} soygun hakkın bitti.`
  if (engel === 'kalkan') return `🛡️ ${mentionOf(kurban)} kalkan almış (${kalan} kaldı).`
  if (engel === 'korunma') return `🚓 ${mentionOf(kurban)} yeni soyuldu, ${kalan} dokunulamaz.`
  if (engel === 'kurban-fakir') return `🥷 ${mentionOf(kurban)} kişisinde çalacak bir şey yok (en az ${MIN_KURBAN_XP} XP).`
  return `🥷 Soygun için en az ${MIN_HIRSIZ_XP} XP'n olmalı, yakalanırsan ceza ödeyeceksin.`
}

export default {
  name: 'soygun',
  aliases: ['soy', 'rob'],
  description: 'Birinin XP\'sini çalmayı dene — yakalanırsan sen ödersin',
  usage: '.soygun @kişi  —  bir mesajı yanıtlayarak .soygun',
  details: [
    `Başarı şansı %${BASARI_YUZDESI}. Başarılıysan kurbanın XP'sinin %10'unu alırsın (en çok 500).`,
    'Yakalanırsan kendi XP\'nin %10\'unu kurbana ödersin (en çok 500).',
    `Günde ${GUNLUK_DENEME} deneme. Soyulan kişiye 6 saat dokunulamaz. Kalkan \`.market\`'te satılır.`,
  ],
  category: 'oyun',
  cooldown: 30,
  ownerOnly: false,

  async execute({ sock, msg, from, sender, parsed }) {
    const yaz = (text, mentions = []) => sock.sendMessage(from, { text, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const [hedef] = resolveTargets(parsed)
      if (!hedef) return await yaz('Kullanım: `.soygun @kişi`')

      const kurban = uyeKimligiBul(metadata, hedef)
      if (!kurban) return await yaz('❌ Bu kişi grupta bulunamadı.')
      if (kurban === sender) return await yaz('Kendini soyamazsın 🙃')

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
              `${mentionOf(sender)}, ${mentionOf(kurban)} kişisinden *${s.miktar} XP* çaldı!`,
              ...(s.odul ? [`🎯 Başındaki *${s.odul} XP* ödülü de aldı!`] : []),
              `💰 ${s.hirsizXp} XP  •  😭 ${s.kurbanXp} XP`,
            ].join('\n')
          : [
              `🚓 *YAKALANDIN*`,
              `${mentionOf(sender)}, ${mentionOf(kurban)} kişisine *${s.miktar} XP* ceza ödedi.`,
              `💸 ${s.hirsizXp} XP  •  😎 ${s.kurbanXp} XP`,
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
