import { binlik } from '../lib/sayi.js'
import { readFile } from 'node:fs/promises'
import logger from '../lib/logger.js'
import { fnv1a } from '../lib/hash.js'
import { istanbulDay } from '../lib/dataset.js'
import { oyunOdulu, oyunTutari, wordleDurumu, wordleKaydet } from '../lib/stats.js'
import { isValidTurkishWord, trLower, trUpper, WordServiceError } from '../lib/turkishWords.js'

export const HARF = 5
export const HAK = 6
/** Taban ödül, kaçıncı denemede bildiğine göre; XP'ye `oyunOdulu` kurla çevirir. */
export const ODULLER = [100, 80, 60, 50, 40, 30]

const VERI = new URL('./kelimeler.json', import.meta.url)
const TR_HARF = /^[abcçdefgğhıijklmnoöprsştuüvyz]+$/

/** Tahtalar yalnızca bellektedir, bot yeniden başlarsa eski satırlar görünmez; hak ve çözüm veritabanındadır. */
const tahtalar = new Map()

let havuz = null

async function havuzuYukle() {
  if (havuz) return havuz
  const ham = JSON.parse(await readFile(VERI, 'utf8'))
  havuz = ham.map(trLower).filter((k) => [...k].length === HARF && TR_HARF.test(k))
  if (!havuz.length) throw new Error('games/kelimeler.json içinde 5 harfli kelime yok')
  return havuz
}

/** Günün kelimesi her grupta aynıdır ve gün boyu değişmez (`.gününsözü` gibi). */
export function gununKelimesi(liste, gun) {
  return liste[fnv1a(`wordle|${gun}`) % liste.length]
}

/**
 * Wordle renkleri. Önce yerinde olan harfler 🟩 alır, kalan harf sayısı kadar 🟨 dağıtılır:
 * hedefte bir tane "a" varken tahmindeki iki "a"nın ikisi de sarı olmaz.
 */
export function degerlendir(tahmin, hedef) {
  const t = [...tahmin]
  const h = [...hedef]
  const sonuc = Array(t.length).fill('⬛')
  const kalan = new Map()

  for (let i = 0; i < t.length; i += 1) {
    if (t[i] === h[i]) sonuc[i] = '🟩'
    else kalan.set(h[i], (kalan.get(h[i]) ?? 0) + 1)
  }
  for (let i = 0; i < t.length; i += 1) {
    if (sonuc[i] === '🟩' || !kalan.get(t[i])) continue
    sonuc[i] = '🟨'
    kalan.set(t[i], kalan.get(t[i]) - 1)
  }
  return sonuc.join('')
}

const harfSatiri = (kelime) => [...trUpper(kelime)].join(' ')

function tahtaAl(anahtar, gun) {
  const t = tahtalar.get(anahtar)
  if (t?.gun === gun) return t
  const yeni = { gun, satirlar: [] }
  tahtalar.set(anahtar, yeni)
  return yeni
}

/**
 * `.wordle` gövdesi; mesaj nesnesi döner, gönderme komutta yapılır.
 * @param {string} [tahmin]  boşsa yalnızca durum gösterilir
 */
export async function wordleOyna({ from, sender, tahmin, now = new Date() }) {
  const gun = istanbulDay(now)
  const anahtar = `${from}|${sender}`
  const liste = await havuzuYukle()
  const hedef = gununKelimesi(liste, gun)
  const durum = wordleDurumu(from, sender, gun)
  const tahta = tahtaAl(anahtar, gun)

  const baslik = `🟩 *WORDLE*  •  ${gun}`
  const ozet = () => tahta.satirlar.join('\n')

  if (!tahmin) {
    const lines = [baslik, '']
    if (tahta.satirlar.length) lines.push(ozet(), '')
    if (durum.cozuldu) lines.push(`✅ Bugünkü kelimeyi ${durum.deneme}. denemede bildin.`)
    else if (durum.deneme >= HAK) lines.push('❌ Bugünkü hakların bitti. Yeni kelime yarın.')
    else {
      lines.push(
        `${HARF} harfli Türkçe kelimeyi ${HAK} denemede bul: \`.wordle kelime\``,
        '🟩 doğru yer  🟨 kelimede var, yeri yanlış  ⬛ yok',
        `Kalan hak: ${HAK - durum.deneme}  •  İlk denemede bilirsen ${binlik(oyunTutari(from, ODULLER[0]))} XP`,
      )
    }
    lines.push(`👥 Bugün bilen: ${durum.cozenler}`)
    return { text: lines.join('\n') }
  }

  if (durum.cozuldu) return { text: '✅ Bugünkü kelimeyi zaten bildin. Yeni kelime yarın.' }
  if (durum.deneme >= HAK) return { text: '❌ Bugünkü hakların bitti. Yeni kelime yarın.' }

  const kelime = trLower(tahmin)
  if ([...kelime].length !== HARF || !TR_HARF.test(kelime)) {
    return { text: `🟩 Tahmin ${HARF} harfli tek bir Türkçe kelime olmalı.` }
  }

  // Sözlük denetimi şart: yoksa "aeıou" gibi harf avı tahminleri yapılırdı. Ağ en sona bırakılır.
  if (kelime !== hedef && !liste.includes(kelime)) {
    try {
      if (!(await isValidTurkishWord(kelime))) return { text: `🟩 *${trUpper(kelime)}* sözlükte yok, hakkın yanmadı.` }
    } catch (err) {
      if (!(err instanceof WordServiceError)) throw err
      logger.warn({ err, from }, 'Wordle kelimesi doğrulanamadı')
      return { text: '🟩 Sözlük servisine ulaşılamıyor, hakkın yanmadı. Birazdan tekrar dene.' }
    }
  }

  const dogru = kelime === hedef
  const kayit = wordleKaydet({ chatJid: from, userJid: sender, gun, dogru, hak: HAK })
  if (!kayit) return { text: '🟩 Wordle şu an kapalı, sonra dene.' }
  if (!kayit.kabul) return { text: kayit.cozuldu ? '✅ Bugünkü kelimeyi zaten bildin.' : '❌ Bugünkü hakların bitti.' }

  tahta.satirlar.push(`${degerlendir(kelime, hedef)}  ${harfSatiri(kelime)}`)
  const lines = [baslik, '', ozet(), '']

  if (dogru) {
    const kazanc = oyunOdulu({ chatJid: from, userJid: sender, amount: ODULLER[kayit.deneme - 1] })
    lines.push(`🎉 ${kayit.deneme}/${HAK} denemede bildin! ⭐ +${binlik(kazanc)} XP`)
  } else if (kayit.deneme >= HAK) {
    // Kelime yazılmaz: aynı kelimeyle oynayan diğerleri için spoiler olurdu.
    lines.push('❌ Hakların bitti. Yeni kelime yarın.')
  } else {
    lines.push(`Kalan hak: ${HAK - kayit.deneme}`)
  }
  return { text: lines.join('\n') }
}
