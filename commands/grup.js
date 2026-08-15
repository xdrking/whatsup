import { isAdmin, requireGroupMetadata } from '../lib/group.js'

const tarih = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
})

// Baileys `creation`'ı saniye cinsinden, bazen string olarak verir.
function olusturulma(creation) {
  const seconds = Number(creation)
  if (!seconds) return 'bilinmiyor'
  return tarih.format(new Date(seconds * 1000))
}

export default {
  name: 'grup',
  aliases: ['grupbilgi', 'groupinfo'],
  description: 'Grup adı, ID\'si, üye sayısı ve oluşturulma bilgisini gösterir',
  usage: '.grup',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    const meta = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!meta) return

    const uyeler = meta.participants || []
    const adminSayisi = uyeler.filter(isAdmin).length

    const lines = [
      `📛 *${meta.subject || 'adsız grup'}*`,
      `🆔 \`${meta.id}\``,
      `👥 Üye: ${uyeler.length}  •  Admin: ${adminSayisi}`,
      `📅 Kuruldu: ${olusturulma(meta.creation)}`,
    ]

    // Bu alanları WhatsApp her zaman vermez; yoksa satır hiç yazılmaz.
    if (meta.owner) lines.push(`👑 Kurucu: @${meta.owner.split('@')[0]}`)
    if (meta.desc) lines.push('', `📝 ${meta.desc.slice(0, 300)}`)

    await sock.sendMessage(
      from,
      { text: lines.join('\n'), mentions: meta.owner ? [meta.owner] : [] },
      { quoted: msg },
    )
  },
}
