import { requireGroupMetadata } from '../lib/group.js'
import { mentionOf } from '../lib/target.js'

// Tek mesajda çok fazla etiket WhatsApp tarafından kırpılabiliyor; liste
// parçalara bölünüp sırayla gönderilir.
const ETIKET_PER_MESAJ = 100

const SAYI = /^\d+$/

function karistir(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export default {
  name: 'etiket',
  aliases: ['tagall', 'herkes', 'duyuru'],
  description: 'Gruptaki herkesi etiketler; sayı verilirse o kadar rastgele kişiyi',
  usage: '.etiket  —  .etiket 3  —  .etiket toplantı var',
  details: [
    '`.etiket` → herkesi etiketler.',
    '`.etiket 3` → rastgele 3 kişiyi etiketler.',
    'Sonuna not ekleyebilirsin: `.etiket toplantı var`  •  `.etiket 2 bulaşık sırası`',
    'Aynı kişi 30 sn içinde tekrar kullanamaz.',
  ],
  category: 'grup',
  ownerOnly: false,
  // Her çağrı tüm gruba bildirim düşürür.
  cooldown: 30,

  async execute({ sock, msg, from, args, parsed }) {
    const meta = await requireGroupMetadata({ sock, msg, from, parsed })
    if (!meta) return

    const uyeler = (meta.participants || []).map((uye) => uye.id)

    if (!uyeler.length) {
      await sock.sendMessage(from, { text: 'Etiketlenecek üye bulunamadı.' }, { quoted: msg })
      return
    }

    const sayiVerildi = SAYI.test(args[0] || '')
    const istenen = sayiVerildi ? Number.parseInt(args[0], 10) : 0

    if (sayiVerildi && istenen < 1) {
      await sock.sendMessage(
        from,
        { text: `1 ile ${uyeler.length} arasında bir sayı yaz.` },
        { quoted: msg },
      )
      return
    }

    const hedefler = sayiVerildi
      ? karistir(uyeler).slice(0, Math.min(istenen, uyeler.length))
      : uyeler

    const not = (sayiVerildi ? args.slice(1) : args).join(' ').trim()

    const baslik = sayiVerildi
      ? `🎯 Rastgele ${hedefler.length} kişi`
      : `📢 Herkes (${hedefler.length})`

    for (let i = 0; i < hedefler.length; i += ETIKET_PER_MESAJ) {
      const parca = hedefler.slice(i, i + ETIKET_PER_MESAJ)

      const lines = [i === 0 ? baslik : `${baslik} — devam`]
      if (i === 0 && not) lines.push(not)
      lines.push('', ...parca.map((jid) => `• ${mentionOf(jid)}`))

      await sock.sendMessage(
        from,
        { text: lines.join('\n'), mentions: parca },
        { quoted: msg },
      )
    }
  },
}
