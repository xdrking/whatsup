import { binlik } from '../lib/sayi.js'
import { displayName, mentionOf } from '../lib/target.js'
import { readFile } from 'node:fs/promises'
import logger from '../lib/logger.js'
import { fnv1a } from '../lib/hash.js'
import { istanbulDay } from '../lib/dataset.js'
import { oyunOdulu, oyunTutari, wordleDurumu, wordleKaydet } from '../lib/stats.js'
import { isValidTurkishWord, trLower, trUpper, WordServiceError } from '../lib/turkishWords.js'

export const HARF = 5
/** Kişi başı günlük tahmin. Tahta ortak olduğu için tek kişi bütün tahminleri yapamasın diye sınırlıdır. */
export const HAK = 3
/** Taban ödül, gruptaki toplam tahmin sayısına göre; XP'ye `oyunOdulu` kurla çevirir. */
export const ODULLER = [100, 80, 60, 50, 40, 30]

const VERI = new URL('./kelimeler.json', import.meta.url)
const TR_HARF = /^[abcçdefgğhıijklmnoöprsştuüvyz]+$/

/** Grup tahtası yalnızca bellektedir, bot yeniden başlarsa eski satırlar görünmez; hak ve çözüm veritabanındadır. */
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

export const oduluHesapla = (toplam) => ODULLER[Math.min(toplam, ODULLER.length) - 1]

function tahtaAl(from, gun) {
  const t = tahtalar.get(from)
  if (t?.gun === gun) return t
  const yeni = { gun, satirlar: [] }
  tahtalar.set(from, yeni)
  return yeni
}

/**
 * `.wordle` gövdesi; mesaj nesnesi döner, gönderme komutta yapılır. Tahta gruba aittir:
 * ilk bilen kazanır ve kelime o gün kapanır, bilenin mesajını kopyalamak bir şey kazandırmaz.
 * @param {string} [tahmin]  boşsa yalnızca durum gösterilir
 */
export async function wordleOyna({ from, sender, tahmin, now = new Date() }) {
  const gun = istanbulDay(now)
  const liste = await havuzuYukle()
  const hedef = gununKelimesi(liste, gun)
  const tahta = tahtaAl(from, gun)
  const durum = wordleDurumu(from, sender, gun)

  const baslik = `🟩 *WORDLE*  •  ${gun}`
  const kapali = (cozen) => ({
    text: `✅ Bugünkü kelimeyi ${mentionOf(cozen)} bildi: *${trUpper(hedef)}*. Yeni kelime yarın.`,
    mentions: [cozen],
  })

  if (durum.cozen) return kapali(durum.cozen)

  if (!tahmin) {
    const lines = [baslik, '']
    if (tahta.satirlar.length) lines.push(...tahta.satirlar, '')
    lines.push(
      `${HARF} harfli Türkçe kelimeyi grupça bulun, ilk bilen kazanır: \`.wordle kelime\``,
      '🟩 doğru yer  🟨 kelimede var, yeri yanlış  ⬛ yok',
      `Senin kalan hakkın: ${Math.max(0, HAK - durum.deneme)}  •  Şu an bilene ${binlik(oyunTutari(from, oduluHesapla(durum.toplam + 1)))} XP`,
    )
    return { text: lines.join('\n') }
  }

  if (durum.deneme >= HAK) return { text: `❌ Bugünkü ${HAK} hakkını kullandın. Diğerleri bulabilir, yeni kelime yarın.` }

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
  if (kayit.kapandi) return kapali(kayit.kapandi)
  if (kayit.hakYok) return { text: `❌ Bugünkü ${HAK} hakkını kullandın.` }

  tahta.satirlar.push(`${degerlendir(kelime, hedef)}  ${harfSatiri(kelime)}  (${displayName(sender)})`)
  const lines = [baslik, '', ...tahta.satirlar, '']

  if (dogru) {
    const kazanc = oyunOdulu({ chatJid: from, userJid: sender, amount: oduluHesapla(kayit.toplam) })
    lines.push(`🎉 ${mentionOf(sender)} bildi! Grup ${kayit.toplam} tahminde buldu. ⭐ +${binlik(kazanc)} XP`, 'Yeni kelime yarın.')
    return { text: lines.join('\n'), mentions: [sender] }
  }
  lines.push(`Senin kalan hakkın: ${HAK - kayit.deneme}`)
  return { text: lines.join('\n') }
}
