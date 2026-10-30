export default {
  name: 'seç',
  aliases: ['sec', 'karar', 'choose'],
  description: 'Yazılan seçeneklerden birini rastgele seçer',
  usage: '.seç pizza | döner | lahmacun',
  details: [
    'Seçenekleri `|` ya da virgülle ayır:',
    '`.seç çay, kahve`  •  `.seç sinema | maç | evde kal`',
  ],
  category: 'eğlence',
  ownerOnly: false,

  async execute({ sock, msg, from, text }) {
    // "|" yoksa virgülle de ayrılabilir: ".seç çay, kahve".
    const ayirici = text.includes('|') ? '|' : ','
    const secenekler = text
      .split(ayirici)
      .map((s) => s.trim())
      .filter(Boolean)

    if (secenekler.length < 2) {
      await sock.sendMessage(
        from,
        { text: '🎯 En az iki seçenek yaz: `.seç pizza | döner | lahmacun`' },
        { quoted: msg },
      )
      return
    }

    const secim = secenekler[Math.floor(Math.random() * secenekler.length)]

    await sock.sendMessage(from, { text: `🎯 Benim seçimim: *${secim}*` }, { quoted: msg })
  },
}
