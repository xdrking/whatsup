import { CalcError, calculate } from '../lib/calc.js'

const MAX_UZUNLUK = 100

const sayi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 10 })

export default {
  name: 'hesap',
  aliases: ['hesapla', 'calc'],
  description: 'Dört işlem, üs, mod ve parantezli hesap yapar',
  usage: '.hesap (12 + 3) * 4 / 2',
  details: [
    'İşlemler: `+ - * / % ^` ve parantez. `×`, `x`, `÷`, `:` de olur.',
    'Ondalık için virgül ya da nokta: `.hesap 3,5 * 2`',
    'Örnekler: `.hesap 2^10`  •  `.hesap (120 - 20) / 4`  •  `.hesap 17 % 5`',
  ],
  category: 'araç',
  ownerOnly: false,

  async execute({ sock, msg, from, text }) {
    const ifade = text.trim()

    if (!ifade || ifade.length > MAX_UZUNLUK) {
      await sock.sendMessage(
        from,
        { text: `🧮 Kullanım: \`.hesap 12 * (3 + 4)\` (en fazla ${MAX_UZUNLUK} karakter)` },
        { quoted: msg },
      )
      return
    }

    let sonuc
    try {
      sonuc = calculate(ifade)
    } catch (err) {
      // Hatalı ifade kullanıcı hatasıdır, teknik hata değil: yalnızca sebebi yazılır.
      if (!(err instanceof CalcError)) throw err
      await sock.sendMessage(from, { text: `🧮 Hesaplayamadım: ${err.message}.` }, { quoted: msg })
      return
    }

    await sock.sendMessage(from, { text: `🧮 ${ifade} = *${sayi.format(sonuc)}*` }, { quoted: msg })
  },
}
