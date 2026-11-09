import { requireGroup } from '../lib/group.js'
import { kumarSiralama } from '../lib/stats.js'
import { displayName } from '../lib/target.js'

const sayi = new Intl.NumberFormat('tr-TR')

export default {
  name: 'kumartop',
  aliases: ['kumarsıralama', 'kumarsiralama'],
  description: 'Kumarda en çok kazananlar ve kaybedenler',
  usage: '.kumartop',
  category: 'kumar',
  ownerOnly: false,

  async execute({ sock, msg, from, parsed }) {
    if (!(await requireGroup({ sock, msg, from, parsed }))) return

    const { kazananlar, kaybedenler } = kumarSiralama(from)
    if (!kazananlar.length && !kaybedenler.length) {
      await sock.sendMessage(from, { text: '🎰 Henüz kimse kumar oynamadı.' }, { quoted: msg })
      return
    }

    const satir = (r, i) =>
      `${i + 1}. ${displayName(r.user_jid)} — ${r.net > 0 ? '+' : ''}${sayi.format(r.net)} XP (${r.games} oyun)`

    const lines = ['🎰 *Kumar Karnesi*']
    if (kazananlar.length) lines.push('', '🏆 *Kazananlar*', ...kazananlar.map(satir))
    if (kaybedenler.length) lines.push('', '💀 *Kaybedenler*', ...kaybedenler.map(satir))

    await sock.sendMessage(
      from,
      { text: lines.join('\n') },
      { quoted: msg },
    )
  },
}
