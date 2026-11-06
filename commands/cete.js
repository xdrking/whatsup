import { requireGroupMetadata, uyeKimligiBul } from '../lib/group.js'
import { AZAMI_UYE, CETE_SEZON_ODULU, ceteAdi, KASA_KESINTI_YUZDESI } from '../lib/cete.js'
import { binlik } from '../lib/sayi.js'
import { ceteAt, ceteAyril, ceteCek, ceteDurumu, ceteKatil, ceteKur, ceteYatir } from '../lib/stats.js'
import { mentionOf, resolveTargets } from '../lib/target.js'
import { trLower } from '../lib/turkishWords.js'
import logger from '../lib/logger.js'

const KAPALI = '🏴 Sığınak şu an kapalı, sonra dene.'
const CETESIZ = '🏴 Bir çetede değilsin.'
const LIDER_DEGIL = '🏴 Bunu yalnızca çete lideri yapabilir.'
const MADALYA = ['🥇', '🥈', '🥉']

function kur({ yaz, chatJid, userJid, adMetni }) {
  const ad = ceteAdi(adMetni)
  if (!ad) return yaz('🏴 Çete adı 2-20 karakter olmalı, yalnızca harf ve rakam: `.çete kur Kara Kediler`')

  const s = ceteKur({ chatJid, userJid, ...ad })
  if (!s) return yaz(KAPALI)
  if (s.uye) return yaz('🏴 Zaten bir çetedesin, önce `.çete ayrıl`.')
  if (s.adVar) return yaz('🏴 Bu adda bir çete var.')
  if (s.yetersiz) return yaz(`🏴 Kuruluş ${binlik(s.ucret)} XP, cüzdanında ${binlik(s.xp)} XP var.`)
  return yaz(`🏴 *${ad.ad}* kuruldu, lider sensin!\n💸 ${binlik(s.ucret)} XP  •  💰 ${binlik(s.xp)} XP`)
}

function katil({ yaz, chatJid, userJid, adMetni }) {
  const ad = ceteAdi(adMetni)
  if (!ad) return yaz('Kullanım: `.çete katıl <ad>`')

  const s = ceteKatil({ chatJid, userJid, anahtar: ad.anahtar })
  if (!s) return yaz(KAPALI)
  if (s.uye) return yaz('🏴 Zaten bir çetedesin, önce `.çete ayrıl`.')
  if (s.yok) return yaz('🏴 Böyle bir çete yok.')
  if (s.dolu) return yaz(`🏴 Çete dolu, en çok ${AZAMI_UYE} üye.`)
  return yaz(`🏴 *${s.ad}* çetesine katıldın.`)
}

function ayril({ yaz, chatJid, userJid }) {
  const s = ceteAyril({ chatJid, userJid })
  if (!s) return yaz(KAPALI)
  if (s.yok) return yaz(CETESIZ)
  if (s.kapandi) return yaz(`🏴 Çete kapandı. Kasadan sana kalan: ${binlik(s.iade)} XP`)
  if (s.yeniLider) return yaz(`🏴 Ayrıldın, yeni lider ${mentionOf(s.yeniLider)}.`, [s.yeniLider])
  return yaz('🏴 Çeteden ayrıldın.')
}

function yatir({ yaz, chatJid, userJid, miktar }) {
  const s = ceteYatir({ chatJid, userJid, miktar })
  if (!s) return yaz(KAPALI)
  if (s.yok) return yaz(CETESIZ)
  if (s.borclu) return yaz('🏴 Borçluyken kasaya para koyamazsın.')
  if (s.yetersiz) return yaz(`🏴 O kadar XP'n yok: ${binlik(s.xp)}`)
  return yaz(`🏴 Kasaya girdi. Kesinti: ${binlik(s.kesinti)} XP\n💼 Kasa: ${binlik(s.kasa)} XP  •  💰 ${binlik(s.xp)} XP`)
}

function cek({ yaz, chatJid, userJid, miktar }) {
  const s = ceteCek({ chatJid, userJid, miktar })
  if (!s) return yaz(KAPALI)
  if (s.yok) return yaz(CETESIZ)
  if (s.liderDegil) return yaz(LIDER_DEGIL)
  if (s.yetersiz) return yaz(`🏴 Kasada o kadar yok: ${binlik(s.kasa)} XP`)
  return yaz(`🏴 Kasadan çekildi.\n💼 Kasa: ${binlik(s.kasa)} XP  •  💰 ${binlik(s.xp)} XP`)
}

function at({ yaz, chatJid, userJid, parsed, metadata }) {
  const [hedef] = resolveTargets(parsed)
  const uye = hedef && uyeKimligiBul(metadata, hedef)
  if (!uye) return yaz('Kullanım: `.çete at @kişi`')

  const s = ceteAt({ chatJid, lider: userJid, hedef: uye })
  if (!s) return yaz(KAPALI)
  if (s.yok) return yaz(CETESIZ)
  if (s.liderDegil) return yaz(LIDER_DEGIL)
  if (s.uyeDegil) return yaz('🏴 Bu kişiyi atamazsın.')
  return yaz(`🏴 ${mentionOf(uye)} çeteden atıldı.`, [uye])
}

function durum({ yaz, chatJid, userJid }) {
  const s = ceteDurumu({ chatJid, userJid })
  if (!s) return yaz(KAPALI)

  const lines = []
  if (s.cete) {
    lines.push(
      `🏴 *${s.cete.ad}*`,
      `👑 Lider: ${mentionOf(s.cete.lider)}`,
      `💼 Kasa: ${binlik(s.cete.kasa)} XP`,
      `👥 ${s.uyeler.map(mentionOf).join(' ')}`,
      '',
    )
  }

  lines.push('🏆 *Haftalık çete sıralaması*', '')
  if (s.siralama.length) {
    lines.push(...s.siralama.map((c, i) => `${MADALYA[i] ?? `${i + 1}.`} ${c.ad} — ${binlik(c.puan)} puan, ${c.uye} üye`))
  } else {
    lines.push('Henüz çete yok.')
  }
  if (!s.cete) lines.push('', `Kurmak ${binlik(s.ucret)} XP: \`.çete kur <ad>\`  •  \`.çete katıl <ad>\``)

  return yaz(lines.join('\n'), s.cete ? [...new Set([s.cete.lider, ...s.uyeler])] : [])
}

export default {
  name: 'çete',
  aliases: ['cete', 'gang'],
  description: 'Çete kur, ortak kasa tut, haftalık sıralamada yarış',
  usage: '.çete  —  .çete kur <ad>  —  .çete katıl <ad>  —  .çete ayrıl  —  .çete yatır <miktar>  —  .çete çek <miktar>  —  .çete at @kişi',
  details: [
    `Kurmak coin kurunun %1'idir, ödenen XP yanar. En çok ${AZAMI_UYE} üye, katılım serbesttir, lider istemediğini atar.`,
    `Kasaya yatırılan XP'den %${KASA_KESINTI_YUZDESI} kesilir. Kasadan yalnızca lider çeker, faiz işlemez.`,
    `Sıralama üyelerin \`.sezon\` puanlarının toplamıdır. Haftanın birincisi kasaya ${binlik(CETE_SEZON_ODULU)} XP alır.`,
    'Lider ayrılırsa en eski üye lider olur, son üye ayrılırsa kasa ona kalır.',
  ],
  category: 'oyun',
  ownerOnly: false,

  async execute({ sock, msg, args, text, from, sender, parsed }) {
    const yaz = (metin, mentions = []) => sock.sendMessage(from, { text: metin, mentions }, { quoted: msg })

    try {
      const metadata = await requireGroupMetadata({ sock, msg, from, parsed })
      if (!metadata) return

      const islem = trLower(args[0] || '')
      const ortak = { yaz, chatJid: from, userJid: sender }
      const adMetni = text.slice((args[0] || '').length)
      const miktar = Number(args[1])

      if (islem === 'kur') return await kur({ ...ortak, adMetni })
      if (['katıl', 'katil'].includes(islem)) return await katil({ ...ortak, adMetni })
      if (['ayrıl', 'ayril'].includes(islem)) return await ayril(ortak)
      if (islem === 'at') return await at({ ...ortak, parsed, metadata })

      if (['yatır', 'yatir', 'çek', 'cek'].includes(islem)) {
        if (!Number.isSafeInteger(miktar) || miktar < 1) return await yaz(`Kullanım: \`.çete ${islem} <miktar>\``)
        return await (['yatır', 'yatir'].includes(islem) ? yatir : cek)({ ...ortak, miktar })
      }

      await durum(ortak)
    } catch (err) {
      logger.error({ err, from }, '.çete başarısız')
      await yaz('🏴 Bir şeyler ters gitti.').catch((e) =>
        logger.error({ err: e }, '.çete hata mesajı gönderilemedi'),
      )
    }
  },
}
