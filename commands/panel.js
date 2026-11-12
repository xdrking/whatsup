import { jidNormalizedUser } from '@whiskeysockets/baileys'
import logger from '../lib/logger.js'
import { kimlikRakam, panelKaydet, panelSil, SIFRE_EN_AZ } from '../lib/panelHesap.js'
import { sifreHashle } from '../panel/guvenlik.js'
import { trLower } from '../lib/turkishWords.js'

const KULLANIM = [
  '🌐 *Web paneli*',
  '',
  'Bu komut yalnızca bota *özelden* yazılır.',
  `\`.panel kayıt <şifre>\`: hesap açar ya da şifreni değiştirir (en az ${SIFRE_EN_AZ} karakter).`,
  '`.panel sil`: hesabını kapatır.',
  '',
  'Girişte numaranı (905…) ya da LID\'ini yaz. Yalnızca botun olduğu gruplardaki üyeler girebilir.',
].join('\n')

/** Kişinin üye olduğu gruplar ve oradaki kimliği; numara ve LID de üye listesinden öğrenilir. */
async function uyelikleriBul(sock, kimlikler) {
  const gruplar = await sock.groupFetchAllParticipating()
  const uyelikler = []
  let numara = ''
  let lid = ''
  for (const [chatJid, metadata] of Object.entries(gruplar)) {
    const uye = (metadata.participants || []).find((u) =>
      [u.id, u.jid, u.lid].some((j) => j && kimlikler.has(jidNormalizedUser(j))),
    )
    if (!uye) continue
    uyelikler.push({ chatJid, userJid: jidNormalizedUser(uye.id) })
    for (const j of [uye.id, uye.jid, uye.lid].filter(Boolean).map((x) => jidNormalizedUser(x))) {
      if (j.endsWith('@s.whatsapp.net')) numara ||= kimlikRakam(j.split('@')[0])
      if (j.endsWith('@lid')) lid ||= kimlikRakam(j.split('@')[0])
    }
  }
  for (const j of kimlikler) {
    if (j.endsWith('@s.whatsapp.net')) numara ||= kimlikRakam(j.split('@')[0])
    if (j.endsWith('@lid')) lid ||= kimlikRakam(j.split('@')[0])
  }
  return { uyelikler, numara, lid }
}

export default {
  name: 'panel',
  aliases: [],
  description: 'Web panelinde kumar oynamak için hesap açar (özelden)',
  usage: '.panel kayıt <şifre> (bota özelden)',
  details: [
    'Bota *özelden* `.panel kayıt <şifre>` yaz, hesabın açılır. Aynı komut şifreni değiştirir.',
    'Panelde numaranla (905…) ya da LID\'inle girersin. Gruptan çıkarsan hesabın kapanır.',
    'Panelde oynanan kumar WhatsApp\'takiyle aynı XP\'yi kullanır.',
    '`.panel sil` hesabını kapatır.',
  ],
  category: 'kumar',
  cooldown: 30,
  ownerOnly: false,

  async execute({ sock, msg, from, args, text, parsed }) {
    const yaz = (t) => sock.sendMessage(from, { text: t }, { quoted: msg })
    const alt = trLower(args[0] || '')

    try {
      if (parsed.isGroup) {
        // Şifre grupta göründü: mesajı silmeyi dene, şifreyi kaydetme.
        if (args.length > 1) {
          await sock.sendMessage(from, { delete: msg.key }).catch((err) =>
            logger.warn({ err, from }, '.panel: grupta yazılan şifre silinemedi'),
          )
          return await yaz('🔐 Şifreni grupta yazdın, kaydetmedim. Bota *özelden* başka bir şifreyle yaz.')
        }
        return await yaz('🔐 `.panel` yalnızca bota özelden yazılır.')
      }

      if (!['kayıt', 'kayit', 'şifre', 'sifre', 'sil'].includes(alt)) return await yaz(KULLANIM)

      const kimlikler = new Set([parsed.sender, parsed.senderPn].filter(Boolean).map((j) => jidNormalizedUser(j)))
      const { uyelikler, numara, lid } = await uyelikleriBul(sock, kimlikler)

      if (alt === 'sil') {
        const silinen = panelSil({ numara, lid })
        if (silinen < 0) return await yaz('❌ Şu an yapılamıyor, sonra dene.')
        return await yaz(silinen ? '🗑️ Panel hesabın kapandı.' : 'Panel hesabın yok.')
      }

      if (!uyelikler.length) return await yaz('🚫 Botun olduğu hiçbir grupta değilsin, panel hesabı açılamaz.')

      // Ham metinden okunur: args'taki tutar çevirisi şifreyi bozabilir ("50m" → 50000000).
      const sifre = text.trim().split(/\s+/).slice(1).join(' ')
      if (sifre.length < SIFRE_EN_AZ) return await yaz(`🔐 Şifre en az ${SIFRE_EN_AZ} karakter olmalı.\nÖrnek: \`.panel kayıt gizli-sifrem-42\``)
      if (sifre.length > 128) return await yaz('🔐 Şifre en çok 128 karakter olabilir.')

      const ok = panelKaydet({ uyelikler, numara, lid, sifre: await sifreHashle(sifre) })
      if (!ok) return await yaz('❌ Hesap yazılamadı, sonra dene.')

      const girisler = [numara && `numara: *${numara}*`, lid && `LID: *${lid}*`].filter(Boolean).join(' ya da ')
      await yaz([
        '✅ Panel hesabın hazır.',
        `Giriş: ${girisler}`,
        `Grup sayısı: ${uyelikler.length}`,
        '',
        '🔐 Şifren bu sohbette duruyor, mesajını silmen iyi olur.',
        'Açık oturumların kapandı, yeni şifreyle gir.',
      ].join('\n'))
    } catch (err) {
      logger.error({ err, from }, '.panel başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.panel hata mesajı gönderilemedi'))
    }
  },
}
