import { activeSince, formatAgo } from '../lib/activity.js'
import { requireGroup } from '../lib/group.js'
import { mentionOf } from '../lib/target.js'

const PENCERE_DK = 60
const MAX_KISI = 15

export default {
  name: 'kimvar',
  aliases: ['aktif', 'aktifler'],
  description: 'Son bir saatte mesaj yazan kişileri gösterir',
  usage: '.kimvar',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const aktifler = activeSince(from, PENCERE_DK * 60_000).slice(0, MAX_KISI)

    if (!aktifler.length) {
      await sock.sendMessage(
        from,
        {
          text: `Son ${PENCERE_DK} dakikada yazan olmadı. ` +
            '(Bot yeni başlatıldıysa liste boştur, zamanla dolar.)',
        },
        { quoted: msg },
      )
      return
    }

    const lines = aktifler.map((entry) => `• ${mentionOf(entry.jid)} — ${formatAgo(entry.at)}`)

    // WhatsApp bir grubun anlık online listesini güvenilir biçimde vermiyor;
    // burada online taklidi yapılmaz, yazılan şey son mesaj zamanıdır.
    await sock.sendMessage(
      from,
      {
        text: [
          `🟢 *Son ${PENCERE_DK} dakikada yazanlar* (${aktifler.length})`,
          '',
          ...lines,
          '',
          '_Bu bir "online" listesi değil; son mesaj zamanına bakıyorum._',
        ].join('\n'),
        mentions: aktifler.map((entry) => entry.jid),
      },
      { quoted: msg },
    )
  },
}
