import { groupMetadata, sahipUyeKimligi } from '../lib/group.js'
import { REBORN_SANS_MS, REBORN_SURE_MS } from '../lib/reborn.js'
import { binlik } from '../lib/sayi.js'
import { rebornOnizle } from '../lib/stats.js'
import { displayName } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import { darbeSuruyor } from '../games/darbe.js'
import { rebornDuyur, rebornIptal, rebornSuruyor } from '../games/reborn.js'
import { grupIdCoz } from './xpver.js'
import logger from '../lib/logger.js'

const DAKIKA = Math.round(REBORN_SURE_MS / 60_000)

export default {
  name: 'reborn',
  aliases: [],
  description: 'Bot sahibi: grubun ekonomisini sıfırlama oylaması başlatır',
  usage: '.reborn <grup id>  —  .reborn onay <grup id>  —  .reborn iptal <grup id>',
  category: 'ekonomi',
  // .help'te görünmez; yalnızca sahip özelden kullanır, grupta iz bırakmadan düşer (.darbe gibi).
  hidden: true,
  ownerOnly: true,
  cooldown: 0,
  // Yalnızca sahip özelden `.help reborn` yazınca görünür (commands/help.js).
  details: [
    '♻️ *Reborn nasıl yapılır?*\n',
    '1️⃣ Bota *özelden* `.reborn <grup id>` yaz: neyin silineceğini gösterir, hiçbir şey değişmez.',
    '2️⃣ `.reborn onay <grup id>` yaz: grupta herkes etiketlenir, reborn anlatılır, oylama başlar. Üyelere özelden de bildirim gider.',
    `3️⃣ Üyeler oylama mesajına *evet* ya da *hayır* yanıtı verir. ${DAKIKA} dakika sonra evet fazlaysa reborn gelir.`,
    '   Eşitlikte ya da kimse oy vermezse gelmez. Sen de oy verebilirsin.\n',
    '🧹 *Sıfırlanan*: cüzdan, banka, kredi, tefeci, coin, mülk, Suly, hisse, yatırım, çete kasası, piyango, ödül, meslek, hapis, hazine.',
    '🛡️ *Kalan*: sayaçlar, rozet, kart, pet, evlilik, makam, unvan, kumar karnesi, şampiyonluk, çeteler.',
    '⭐ En zengin 3 kişi profilinde kalıcı yıldız alır.\n',
    `🤫 *Gizli*: reborn'dan sonraki ${Math.round(REBORN_SANS_MS / 3_600_000)} saat \`.crash\`'te (panelde de) herkesin kaybeden çekilişi %25 olasılıkla bir kez daha atılır. Gruba yalnızca "bazı kumar oyunlarında şans arttı" denir.\n`,
    '🛑 `.reborn iptal <grup id>` süren oylamayı kapatır.',
    '💾 Uygulamadan önce `data/yedek/reborn-oncesi-*.db` yedeği alınır; alınamazsa reborn yapılmaz.',
    '⚠️ Bot oylama sürerken yeniden başlarsa oylama düşer, yeniden başlatman gerekir.',
  ],

  async execute({ sock, msg, args, from, parsed }) {
    const yaz = (text) => sock.sendMessage(from, { text }, { quoted: msg })

    if (parsed.isGroup) {
      logger.info({ from }, '.reborn grupta yazıldı, yok sayıldı')
      return
    }

    try {
      const ilk = trLower(args[0] || '')
      const eylem = ['onay', 'iptal'].includes(ilk) ? ilk : null
      const grup = grupIdCoz(String((eylem ? args[1] : args[0]) || '').replace(/`/g, ''))
      if (!grup) return await yaz('Kullanım: `.reborn <grup id>`, sonra `.reborn onay <grup id>`. Durdurmak için `.reborn iptal <grup id>`.')

      if (eylem === 'iptal') {
        return await yaz(rebornIptal(grup) ? '🛑 Oylama iptal edildi, hiçbir şey değişmedi.' : 'Bu grupta süren reborn oylaması yok.')
      }

      if (rebornSuruyor(grup)) return await yaz('♻️ Bu grupta oylama zaten sürüyor.')

      let metadata
      try {
        metadata = await groupMetadata(sock, grup)
      } catch (err) {
        logger.error({ err, grup }, '.reborn grup bilgisi alınamadı')
        return await yaz('❌ Grup bulunamadı ya da bot grupta değil.')
      }
      const ad = metadata.subject || 'Grup'

      if (!eylem) {
        const o = rebornOnizle({ chatJid: grup })
        if (!o) return await yaz('❌ Veritabanına ulaşılamadı.')
        return await yaz([
          `♻️ *${ad}* — ${o.no}. reborn için önizleme (hiçbir şey değişmedi)`,
          '',
          `👥 Hesabı olan üye: ${o.uye}`,
          `💰 Piyasadaki para: ${binlik(o.arz)} XP`,
          `🪙 Kur: ${binlik(o.kur)} XP`,
          `🏛️ Hazine: ${binlik(o.kasa)} XP`,
          ...(o.zenginler.length ? ['', '⭐ Yıldız alacaklar:', ...o.zenginler.map((z, i) => `${i + 1}. ${displayName(z.user_jid)} — ${binlik(z.servet)} XP`)] : []),
          '',
          `Oylamayı başlatmak için: \`.reborn onay ${grup}\``,
        ].join('\n'))
      }

      if (darbeSuruyor(grup)) return await yaz('🪖 Bu grupta darbe sürüyor, bitmesini bekle.')

      const sahip = sahipUyeKimligi(metadata)
      if (!sahip) return await yaz('❌ Sen bu grupta görünmüyorsun.')

      const duyuruldu = await rebornDuyur({ sock, chatJid: grup, metadata, sahip })
      if (!duyuruldu) return await yaz('⚠️ Grup duyurusu gönderilemedi, oylama başlamadı.')

      await yaz(`♻️ *${ad}* grubunda oylama başladı. Sonuç ${DAKIKA} dakika sonra grupta. Durdurmak için: \`.reborn iptal ${grup}\``)
    } catch (err) {
      logger.error({ err }, '.reborn başarısız')
      await yaz('❌ Bir şeyler ters gitti.').catch((e) => logger.error({ err: e }, '.reborn hata mesajı gönderilemedi'))
    }
  },
}
