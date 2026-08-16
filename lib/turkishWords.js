import logger from './logger.js'
import { getDb } from './db.js'

const TDK_URL = 'https://sozluk.gov.tr/gts'

// TDK bazen yavaşlar; oyun bir kelime için sonsuza kadar beklememeli.
const TDK_TIMEOUT_MS = 6_000

// Yedek paketin kendi zaman aşımı yok, dışarıdan sınırlanır. Kısa tutulur:
// birincil kaynak zaten 6 sn beklemiştir, kullanıcı 15 sn cevap bekleyemez.
const YEDEK_TIMEOUT_MS = 4_000

/**
 * "Karar veremedim" sinyali: servis çöktü, zaman aşımına uğradı ya da
 * beklenmeyen bir cevap döndü. **Geçersiz kelime demek değildir** — çağıran
 * taraf bunu yakalayıp oyun durumuna dokunmadan kullanıcıyı uyarır.
 */
export class WordServiceError extends Error {
  constructor(message, options) {
    super(message, options)
    this.name = 'WordServiceError'
  }
}

/** Türkçe küçük harf: "İSTANBUL" → "istanbul" (varsayılan locale "i̇stanbul" üretir). */
export function trLower(text) {
  return String(text || '').trim().toLocaleLowerCase('tr')
}

/** Türkçe büyük harf: "iyi" → "İYİ" (varsayılan locale "IYI" üretir). */
export function trUpper(text) {
  return String(text || '').trim().toLocaleUpperCase('tr')
}

/**
 * Zincirin devam edeceği harf. Türkçede hiçbir kelime "ğ" ile başlamadığı için
 * kelime "ğ" ile bitiyorsa (ağ, yağ, dağ) bir önceki harfe düşülür; yoksa oyun
 * kimsenin cevap veremeyeceği bir harfte kilitlenir.
 */
export function lastLetter(word) {
  const clean = trLower(word)
  if (!clean) return ''

  for (let i = clean.length - 1; i >= 0; i -= 1) {
    if (clean[i] !== 'ğ') return clean[i]
  }

  return clean[clean.length - 1]
}

// Hazırlanmış sorgular bir kez derlenir (lib/stats.js ile aynı desen).
let sorgular = null

function hazirla() {
  if (sorgular) return sorgular

  const db = getDb()
  if (!db) return null

  sorgular = {
    oku: db.prepare('SELECT valid FROM word_cache WHERE word = ?'),
    yaz: db.prepare(`
      INSERT INTO word_cache (word, valid, checked_at)
      VALUES (?, ?, ?)
      ON CONFLICT (word) DO UPDATE SET valid = excluded.valid, checked_at = excluded.checked_at
    `),
  }

  return sorgular
}

function onbellektenOku(word) {
  try {
    const q = hazirla()
    if (!q) return null

    const row = q.oku.get(word)
    if (!row) return null

    return row.valid === 1
  } catch (err) {
    logger.error({ err, word }, 'Kelime önbelleği okunamadı')
    return null
  }
}

// Yalnızca kesin sonuçlar yazılır: WordServiceError asla önbelleğe girmez,
// yoksa geçici bir ağ hatası kelimeyi kalıcı olarak "geçersiz" yapardı.
function onbellegeYaz(word, valid) {
  try {
    const q = hazirla()
    if (!q) return

    q.yaz.run(word, valid ? 1 : 0, Date.now())
  } catch (err) {
    logger.error({ err, word }, 'Kelime önbelleğine yazılamadı')
  }
}

/**
 * Birincil kaynak: TDK Güncel Türkçe Sözlük.
 * Kelime varsa madde dizisi, yoksa `{ error: "Sonuç bulunamadı" }` döner —
 * "yok" ile "ulaşamadım" bu sayede kesin olarak ayrılır.
 */
async function tdkSorgula(word) {
  let response

  try {
    response = await fetch(`${TDK_URL}?ara=${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(TDK_TIMEOUT_MS),
    })
  } catch (err) {
    throw new WordServiceError('TDK isteği başarısız', { cause: err })
  }

  if (!response.ok) {
    throw new WordServiceError(`TDK ${response.status} döndü`)
  }

  let data
  try {
    data = await response.json()
  } catch (err) {
    throw new WordServiceError('TDK cevabı JSON değil', { cause: err })
  }

  if (Array.isArray(data)) {
    if (data.length) return true
    throw new WordServiceError('TDK boş dizi döndürdü')
  }

  if (data && typeof data.error === 'string') return false

  throw new WordServiceError('TDK beklenmeyen bir cevap döndürdü')
}

/**
 * Yedek kaynak: `tdk-all-api`. Paketin tüm gövdesi boş bir catch içinde olduğu
 * için hata da "kelime yok" da `undefined` olarak döner; bu yüzden **yalnızca
 * olumlu sonucuna güvenilir**, `undefined` "karar veremedim" sayılır.
 * Dinamik import: paket eksik ya da bozuksa bot açılışta patlamaz.
 *
 * DİKKAT (2026-08 itibarıyla ölçüldü): paketin sırayla çağırdığı yedi TDK
 * ucundan biri (`terim?eser_ad=tümü`) bağlantıyı reddediyor. Paket bu hatayı
 * yutup her kelime için `undefined` döndürdüğü için yedek yol şu an pratikte
 * hiçbir zaman olumlu sonuç veremiyor. Zararsız ama işe de yaramıyor; TDK ucu
 * düzelirse kendiliğinden çalışmaya başlar.
 */
async function yedekSorgula(word) {
  let getWord

  try {
    const modul = await import('tdk-all-api')
    getWord = modul.default || modul
  } catch (err) {
    throw new WordServiceError('Yedek kelime servisi yüklenemedi', { cause: err })
  }

  if (typeof getWord !== 'function') {
    throw new WordServiceError('Yedek kelime servisi beklenen biçimde değil')
  }

  let sonuc
  try {
    sonuc = await Promise.race([
      getWord(word),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('zaman aşımı')), YEDEK_TIMEOUT_MS).unref()
      }),
    ])
  } catch (err) {
    throw new WordServiceError('Yedek kelime servisi cevap vermedi', { cause: err })
  }

  if (sonuc && sonuc.word) return true

  throw new WordServiceError('Yedek kelime servisi sonuç ayırt edemedi')
}

/**
 * Kelime Türkçe sözlükte var mı?
 *
 * @returns {Promise<boolean>} yalnızca kesin sonuçlarda true/false
 * @throws {WordServiceError} servise ulaşılamadıysa (kelime geçersiz sayılmamalı)
 */
export async function isValidTurkishWord(word) {
  const clean = trLower(word)
  if (!clean) return false

  const cached = onbellektenOku(clean)
  if (cached !== null) return cached

  let birincilHata

  try {
    const gecerli = await tdkSorgula(clean)
    onbellegeYaz(clean, gecerli)
    return gecerli
  } catch (err) {
    if (!(err instanceof WordServiceError)) throw err
    birincilHata = err
    logger.warn({ err: err.message, word: clean }, 'TDK sorgusu başarısız, yedeğe geçiliyor')
  }

  let gecerli
  try {
    gecerli = await yedekSorgula(clean)
  } catch (err) {
    logger.warn({ err: err.message, word: clean }, 'Yedek kelime servisi de sonuç veremedi')
    // Kullanıcıya birincil kaynağın hatası bildirilir; yedek yalnızca destek.
    throw birincilHata
  }

  onbellegeYaz(clean, gecerli)
  return gecerli
}
