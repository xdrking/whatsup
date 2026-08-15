import { fetchAvatar, mentionOf, resolveTargets } from '../lib/target.js'

export default {
  name: 'pp',
  aliases: ['profilfoto', 'avatar'],
  description: 'Hedefin profil fotoğrafını getirir',
  usage: '.pp @kişi  —  bir mesajı yanıtlayarak .pp  —  hedefsiz .pp kendi fotoğrafını getirir',
  ownerOnly: false,

  async execute({ sock, msg, from, args, parsed }) {
    const [jid] = resolveTargets(parsed, { args, limit: 1, includeSender: true })

    const avatar = await fetchAvatar(sock, jid)

    // fetchAvatar hatayı yutmaz, loglar; kullanıcıya sebebi ayırt etmeden söylemek
    // yeterli: fotoğraf yoksa da gizliyse de sonuç aynı.
    if (!avatar) {
      await sock.sendMessage(
        from,
        {
          text: `${mentionOf(jid)} için profil fotoğrafı alınamadı: ya fotoğraf yok ` +
            'ya da gizlilik ayarı kapatıyor.',
          mentions: [jid],
        },
        { quoted: msg },
      )
      return
    }

    await sock.sendMessage(
      from,
      { image: avatar, caption: `🖼️ ${mentionOf(jid)}`, mentions: [jid] },
      { quoted: msg },
    )
  },
}
