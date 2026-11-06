// .görev, .market ve .soygun.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const { GOREVLER, gununGorevleri } = await import('../lib/gorev.js')
const { URUNLER, KALKAN_SURESI_MS } = await import('../lib/market.js')
const { KASALAR, kasaCek } = await import('../lib/kasa.js')
const { kartBul, kartCek, setCekisi, SETLER } = await import('../lib/kart.js')
const { BANKA_TAVANI, faizHesapla, faizIslet, vergiHesapla } = await import('../lib/banka.js')
const { haftaAnahtari, haftaBitisi, SEZON_ODULLERI } = await import('../lib/sezon.js')
const { ADIM_MS, fiyatAdimi, HAVALAR, hisseBul, HISSELER, piyasaHavasi, SAAT_MS } = await import('../lib/borsa.js')
const { VITRIN, vitrinUrunu } = await import('../lib/vitrin.js')
const { KORUNMA_MS, soygunPayi } = await import('../lib/soygun.js')
const {
  addXp, bahisOyna, bankaBakiyesi, borsaAl, borsaDurumu, borsaSat, kartlariOku, kartVer, setTamamla, vitrinKalan, bankaCek, bankaDurumu, bankaYatir, carkDurumu, carkOyna, getStats, gorevTopla, kasaAc, marketAl, marketDurumu, odulKoy, odulListesi, recordMessage, sampiyonlukSayisi, sezonDurumu, soygunYap,
} = await import('../lib/stats.js')
const { istanbulDay } = await import('../lib/dataset.js')

const T = new Date('2026-06-10T12:00:00+03:00').getTime()
const GUN = 86_400_000

let sayac = 0
const yeniGrup = () => `e${++sayac}@g.us`
const urun = (tur, alan = {}) => URUNLER.find((u) => u.tur === tur && Object.entries(alan).every(([k, v]) => u[k] === v))

test('günün görevleri: 3 farklı görev, aynı gün aynı', () => {
  const g = gununGorevleri('2026-06-10')
  assert.equal(new Set(g.map((x) => x.anahtar)).size, 3)
  assert.deepEqual(g, gununGorevleri('2026-06-10'))
})

test('görev: ödül bir kez verilir, ertesi gün sıfırlanır', () => {
  // Bugünün görevleri içinde mesaj görevi olan bir gün bulunur.
  let gun = T
  while (!gununGorevleri(istanbulDay(new Date(gun))).some((g) => g.anahtar === 'mesaj')) gun += GUN
  const mesaj = GOREVLER.find((g) => g.anahtar === 'mesaj')

  const k = { chatJid: yeniGrup(), userJid: 'u@lid' }
  for (let i = 0; i < mesaj.hedef - 1; i += 1) recordMessage({ ...k, type: 'conversation', at: gun })

  const eksik = gorevTopla({ ...k, now: gun })
  assert.equal(eksik.kazanilan, 0)
  assert.equal(eksik.gorevler.find((g) => g.anahtar === 'mesaj').sayac, mesaj.hedef - 1)

  recordMessage({ ...k, type: 'conversation', at: gun })
  const once = getStats(k.chatJid, k.userJid).xp
  assert.equal(gorevTopla({ ...k, now: gun }).kazanilan, mesaj.odul)
  assert.equal(gorevTopla({ ...k, now: gun }).kazanilan, 0)
  assert.equal(getStats(k.chatJid, k.userJid).xp, once + mesaj.odul)

  recordMessage({ ...k, type: 'conversation', at: gun + GUN })
  const sonraki = gorevTopla({ ...k, now: gun + GUN }).gorevler.find((g) => g.anahtar === 'mesaj')
  if (sonraki) assert.equal(sonraki.sayac, 1)
})

test('market: yetersiz XP, kalkan süresi eklenir, unvan iki kez alınmaz', () => {
  const k = { chatJid: yeniGrup(), userJid: 'u@lid' }
  const kalkan = urun('kalkan')
  const unvan = urun('unvan')

  assert.deepEqual(marketAl({ ...k, urun: kalkan, now: T }), { yetersiz: true, xp: 0 })

  addXp({ ...k, amount: kalkan.fiyat * 2 + unvan.fiyat })
  marketAl({ ...k, urun: kalkan, now: T })
  assert.equal(marketAl({ ...k, urun: kalkan, now: T }).kalkan, T + 2 * KALKAN_SURESI_MS)

  marketAl({ ...k, urun: unvan, now: T })
  assert.equal(getStats(k.chatJid, k.userJid).xp, 0)
  assert.equal(marketDurumu(k.chatJid, k.userJid, T).unvan, unvan.unvan)
  assert.deepEqual(marketAl({ ...k, urun: unvan, now: T }), { zatenVar: true })
  assert.equal(marketDurumu(k.chatJid, k.userJid, T).kalkan, T + 2 * KALKAN_SURESI_MS)
})

test('market bonusu oyun XP\'sini katlar, çark hakkına dokunmaz', () => {
  const k = { chatJid: yeniGrup(), userJid: 'u@lid' }
  const bonus = urun('bonus', { bonus: 200 })
  addXp({ ...k, amount: bonus.fiyat })
  marketAl({ ...k, urun: bonus, now: T })

  assert.equal(addXp({ ...k, amount: 5, at: T + 1 }), 15)
  assert.equal(carkDurumu({ ...k, now: T }).kalan, 2)
})

test('soygun payı %10, üst sınır yok', () => {
  assert.equal(soygunPayi(100), 10)
  assert.equal(soygunPayi(99_999), 9999)
})

function soygunKur(hirsizXp = 200, kurbanXp = 1000) {
  const chatJid = yeniGrup()
  addXp({ chatJid, userJid: 'h', amount: hirsizXp })
  addXp({ chatJid, userJid: 'k', amount: kurbanXp })
  return { chatJid, hirsiz: 'h', kurban: 'k' }
}

test('soygun başarılı: XP geçer, kurban korunur, toplam değişmez', () => {
  const s = soygunKur()
  assert.deepEqual(soygunYap({ ...s, sans: () => true, now: T }), {
    basarili: true, miktar: 100, odul: 0, hirsizXp: 300, kurbanXp: 900,
  })
  assert.deepEqual(soygunYap({ ...s, sans: () => true, now: T + 1 }), { engel: 'korunma', bitis: T + KORUNMA_MS })
  assert.equal(soygunYap({ ...s, sans: () => true, now: T + KORUNMA_MS }).basarili, true)
})

test('soygun yakalanma: hırsız kendi payını kurbana öder', () => {
  const s = soygunKur()
  assert.deepEqual(soygunYap({ ...s, sans: () => false, now: T }), {
    basarili: false, miktar: 20, odul: 0, hirsizXp: 180, kurbanXp: 1020,
  })
})

test('soygun: günde 2 deneme, engeller hak yakmaz, ertesi gün yenilenir', () => {
  const s = soygunKur()
  let cekildi = false
  const sans = () => { cekildi = true; return false }

  assert.deepEqual(soygunYap({ ...s, kurban: 'yok', sans, now: T }), { engel: 'kurban-fakir' })
  assert.equal(cekildi, false)

  soygunYap({ ...s, sans, now: T })
  soygunYap({ ...s, sans, now: T })
  assert.deepEqual(soygunYap({ ...s, sans, now: T }), { engel: 'hak' })
  assert.equal(soygunYap({ ...s, sans, now: T + GUN }).basarili, false)
})

test('soygun: kalkan ve hırsızın bakiyesi engeller', () => {
  const s = soygunKur(10, 1000)
  assert.deepEqual(soygunYap({ ...s, sans: () => true, now: T }), { engel: 'hirsiz-fakir' })

  const kalkan = urun('kalkan')
  marketAl({ chatJid: s.chatJid, userJid: 'k', urun: kalkan, now: T })
  assert.equal(soygunYap({ ...s, sans: () => true, now: T }).engel, 'kalkan')
})

const kisi = (xp) => {
  const k = { chatJid: yeniGrup(), userJid: 'a' }
  if (xp) addXp({ ...k, amount: xp, at: T })
  return k
}
const ac = (k, odul, kasa = KASALAR[0]) => kasaAc({ ...k, kasa, cek: () => odul, now: T })

test('key tabloları: fiyatlar, toplam 100, beklenen XP fiyatın altında', () => {
  assert.deepEqual(KASALAR.map((k) => k.fiyat), [50, 100, 250, 500, 750, 1000])
  for (const kasa of KASALAR) {
    assert.equal(kasa.oduller.reduce((t, o) => t + o.agirlik, 0), 100, kasa.ad)
    const kartDegeri = (o) => {
      const set = SETLER[o.kartSet]
      return set ? set.odul / setCekisi(set) : 0
    }
    const ev = kasa.oduller.reduce(
      (t, o) => t + (o.agirlik / 100) * ((o.xp || 0) + (o.yedekXp || 0) + kartDegeri(o)),
      0,
    )
    assert.ok(ev < kasa.fiyat, `${kasa.ad} beklenen XP ${ev}`)

    const gorulen = new Set()
    for (let r = 0; r < 100; r++) {
      const o = kasaCek(kasa, (n) => r % n)
      gorulen.add(o.kartSet ?? o.etiket)
    }
    assert.equal(gorulen.size, kasa.oduller.length, kasa.ad)
  }
})

test('key: XP yetmezse ödül çekilmez, yeterse ücret düşer ve ödül eklenir', () => {
  const k = kisi(49)
  let cekildi = false
  const s = kasaAc({ ...k, kasa: KASALAR[0], cek: () => { cekildi = true; return {} }, now: T })
  assert.deepEqual(s, { yetersiz: true, xp: 49 })
  assert.equal(cekildi, false)

  addXp({ ...k, amount: 51, at: T })
  assert.equal(ac(k, { xp: 20 }).xp, 70)
  assert.equal(ac(k, {}).xp, 20)
  assert.equal(getStats(k.chatJid, k.userJid).xp, 20)
})

test('key: unvan boşsa yazılır, varsa korunur ve yerine XP gelir', () => {
  const k = kisi(100)
  const odul = { unvan: '🍀 Şanslı', yedekXp: 500 }
  assert.equal(ac(k, odul).yedekXp, 0)
  assert.equal(marketDurumu(k.chatJid, k.userJid, T).unvan, odul.unvan)

  const s = ac(k, { unvan: '🐉 Efsane', yedekXp: 1000 })
  assert.equal(s.yedekXp, 1000)
  assert.equal(s.xp, 1000)
  assert.equal(marketDurumu(k.chatJid, k.userJid, T).unvan, odul.unvan)
})

test('key: kalkan eklenir, unvana dokunmaz; bonus çark hakkına dokunmaz', () => {
  const k = kisi(200)
  ac(k, { unvan: '🍀 Şanslı', yedekXp: 500 })
  ac(k, { kalkanMs: 1000 })
  ac(k, { kalkanMs: 1000 })
  assert.deepEqual(marketDurumu(k.chatJid, k.userJid, T), { unvan: '🍀 Şanslı', kalkan: T + 2000 })

  ac(k, { bonus: 200 })
  const d = carkDurumu({ ...k, now: T })
  assert.equal(d.kalan, 2)
  assert.equal(d.bonus.yuzde, 200)
})

test('key: çark hakkı açık da kapalı pencerede de fazladan çevirme verir', () => {
  const bos = () => ({})
  const kapali = kisi(50)
  ac(kapali, { carkHakki: 1 })
  assert.equal(carkDurumu({ ...kapali, now: T }).kalan, 3)
  for (const kalan of [2, 1, 0]) assert.equal(carkOyna({ ...kapali, cevir: bos, now: T }).kalan, kalan)
  assert.ok(carkOyna({ ...kapali, cevir: bos, now: T }).hakYok)

  const acik = kisi(50)
  carkOyna({ ...acik, cevir: () => ({ bonus: 200 }), now: T })
  carkOyna({ ...acik, cevir: bos, now: T })
  ac(acik, { carkHakki: 1 })
  const d = carkDurumu({ ...acik, now: T })
  assert.equal(d.kalan, 1)
  assert.equal(d.bonus.yuzde, 200)
})

test('key: soygun hakkı o gün üçüncü denemeyi açar, ertesi gün sıfırlanır', () => {
  const k = kisi(5000)
  const kurban = (i) => { addXp({ chatJid: k.chatJid, userJid: `v${i}`, amount: 5000, at: T }); return `v${i}` }
  const soy = (i, now = T) => soygunYap({ chatJid: k.chatJid, hirsiz: 'a', kurban: kurban(i), sans: () => false, now })

  ac(k, { soygunHakki: 1 })
  for (let i = 0; i < 3; i++) assert.equal(soy(i).basarili, false)
  assert.equal(soy(3).engel, 'hak')
  assert.equal(soy(4, T + GUN).basarili, false)
})

test('ödül: kesinti yanar, birikir, başarılı soygunda alınır', () => {
  const k = kisi(1000)
  const s = { chatJid: k.chatJid, koyan: 'a', hedef: 'b', miktar: 100 }
  assert.deepEqual(odulKoy({ ...s, miktar: 1001 }), { yetersiz: true, xp: 1000 })
  assert.deepEqual(odulKoy(s), { havuz: 90, kesinti: 10, xp: 900 })
  assert.equal(odulKoy(s).havuz, 180)

  // Hedefin XP'si yok: ödül varken yine de soyulabilmeli.
  const soy = (sans, hirsiz = 'c') => soygunYap({ chatJid: k.chatJid, hirsiz, kurban: 'b', sans: () => sans, now: T })
  addXp({ chatJid: k.chatJid, userJid: 'c', amount: 100, at: T })
  assert.equal(soy(false).odul, 0)
  assert.deepEqual(odulListesi(k.chatJid), [{ user_jid: 'b', xp: 180 }])

  const basarili = soy(true)
  assert.equal(basarili.odul, 180)
  assert.equal(getStats(k.chatJid, 'c').xp, basarili.hirsizXp)
  assert.deepEqual(odulListesi(k.chatJid), [])
})

test('banka hesapları: faiz bileşik, tavansız, saat sınırlı; vergi yalnız eşiğin üstünden', () => {
  assert.equal(faizHesapla(1000, 1).faiz, 150)
  assert.equal(faizHesapla(10_000, 2).faiz, 3225)
  assert.equal(faizHesapla(10_000, 1000).faiz, faizHesapla(10_000, 168).faiz)
  assert.equal(faizHesapla(5, 1).faiz, 0)
  assert.ok(Math.abs(faizHesapla(5, 1).artik - 0.75) < 1e-9)
  assert.equal(faizHesapla(5, 1, 0.5).faiz, 1)
  assert.deepEqual(faizHesapla(BANKA_TAVANI - 10, 168), { faiz: 10, artik: 0 })
  assert.deepEqual(faizHesapla(BANKA_TAVANI, 168), { faiz: 0, artik: 0 })
  assert.equal(vergiHesapla(10_000), 0)
  assert.equal(vergiHesapla(20_000), 100)
})

test('banka: yatır, faiz işler, çekerken kesinti alınır', () => {
  const k = kisi(1000)
  assert.deepEqual(bankaYatir({ ...k, miktar: 1001, now: T }), { yetersiz: true, xp: 1000 })
  assert.deepEqual(bankaYatir({ ...k, miktar: 1000, now: T }), { bakiye: 1000, xp: 0, krediOdeme: 0, kalanBorc: 0 })

  assert.equal(bankaDurumu({ ...k, now: T }).faiz, 0)
  assert.equal(bankaDurumu({ ...k, now: T + SAAT_MS - 1 }).faiz, 0)
  assert.equal(bankaDurumu({ ...k, now: T + GUN }).faiz, 23891)
  assert.equal(bankaDurumu({ ...k, now: T + GUN }).faiz, 0)
  assert.equal(bankaBakiyesi(k.chatJid, k.userJid), 24891)

  assert.deepEqual(bankaCek({ ...k, miktar: 30000, now: T + GUN }), { yetersiz: true, bakiye: 24891 })
  assert.deepEqual(bankaCek({ ...k, miktar: 1000, now: T + GUN }), { bakiye: 23891, xp: 950, kesinti: 50 })
})

test('banka: küçük bakiye saat saat bakılsa da faiz alır, yeni yatırım geçmiş faiz almaz', () => {
  const k = kisi(100_500)
  bankaYatir({ ...k, miktar: 5, now: T })

  let toplam = 0
  for (let saat = 1; saat <= 4; saat++) toplam += bankaDurumu({ ...k, now: T + saat * SAAT_MS }).faiz
  assert.equal(toplam, 2)

  const sonra = T + 100 * SAAT_MS
  bankaYatir({ ...k, miktar: 100_000, now: sonra })
  assert.equal(bankaDurumu({ ...k, now: sonra }).faiz, 0)
})

test('banka: yeni para tam bir saat durmadan faiz almaz, eski bakiye etkilenmez', () => {
  const DK = 60 * 1000
  const k = kisi(5000)

  bankaYatir({ ...k, miktar: 1000, now: T + 59 * DK })
  assert.equal(bankaDurumu({ ...k, now: T + SAAT_MS }).faiz, 0)
  assert.equal(bankaDurumu({ ...k, now: T + 2 * SAAT_MS }).faiz, 150)

  bankaYatir({ ...k, miktar: 1000, now: T + 2 * SAAT_MS + 59 * DK })
  assert.equal(bankaDurumu({ ...k, now: T + 3 * SAAT_MS }).faiz, 172)

  // Aynı saatte yatırılıp çekilen para eski parayı faizsiz bırakmaz.
  const c = kisi(5000)
  bankaYatir({ ...c, miktar: 1000, now: T })
  bankaDurumu({ ...c, now: T + SAAT_MS })
  bankaYatir({ ...c, miktar: 500, now: T + SAAT_MS + DK })
  bankaCek({ ...c, miktar: 500, now: T + SAAT_MS + 2 * DK })
  assert.equal(bankaDurumu({ ...c, now: T + 2 * SAAT_MS }).faiz, 150)

  assert.equal(faizIslet(1000, 1000, 1).faiz, 0)
  assert.equal(faizIslet(1000, 1000, 2).faiz, 150)
  assert.equal(faizIslet(1000, 0, 0).faiz, 0)
  assert.equal(faizIslet(1000, 0, 1000).faiz, faizIslet(1000, 0, 168).faiz)
})

test('vergi: günün ilk mesajında bir kez kesilir, banka muaf, altında kesilmez', () => {
  const k = kisi(20_000)
  const mesaj = (at) => recordMessage({ ...k, type: 'conversation', at })
  mesaj(T)
  const xp = getStats(k.chatJid, k.userJid).xp
  assert.equal(xp, 19_901)
  mesaj(T + 60_000)
  assert.equal(getStats(k.chatJid, k.userJid).xp, xp + 1)
  assert.equal(bankaDurumu({ ...k, now: T }).sonVergi, 100)

  bankaYatir({ ...k, miktar: 15_000, now: T })
  const sonra = getStats(k.chatJid, k.userJid).xp
  mesaj(T + GUN)
  assert.equal(getStats(k.chatJid, k.userJid).xp, sonra + 1)
})

test('hafta: pazartesi başlar, Türkiye saatine göre döner', () => {
  assert.equal(haftaAnahtari(new Date('2026-11-04T12:00:00+03:00')), '2026-11-02')
  assert.equal(haftaAnahtari(new Date('2026-11-02T00:30:00+03:00')), '2026-11-02')
  assert.equal(haftaAnahtari(new Date('2026-11-01T23:30:00+03:00')), '2026-10-26')
  assert.equal(haftaBitisi('2026-11-02'), Date.parse('2026-11-09T00:00:00+03:00'))
})

test('sezon: kumar sayılmaz, hafta kapanınca ödül bir kez dağıtılır', () => {
  const k = kisi(0)
  const c = k.chatJid
  addXp({ chatJid: c, userJid: 'a', amount: 30, at: T })
  addXp({ chatJid: c, userJid: 'b', amount: 20, at: T })
  addXp({ chatJid: c, userJid: 'c', amount: 10, at: T })
  addXp({ chatJid: c, userJid: 'd', amount: 5, at: T })
  bahisOyna({ chatJid: c, userJid: 'd', miktar: 5, cevir: () => ({ carpan: 100 }), at: T })

  const s = sezonDurumu({ chatJid: c, now: T })
  assert.deepEqual(s.kapanan, [])
  assert.deepEqual(s.siralama.map((x) => x.puan), [30, 20, 10, 5])

  const sonra = T + 7 * GUN
  const kapanis = sezonDurumu({ chatJid: c, now: sonra })
  assert.deepEqual(kapanis.kapanan[0].kazananlar.map((x) => x.user_jid), ['a', 'b', 'c'])
  assert.equal(getStats(c, 'a').xp, 30 + SEZON_ODULLERI[0])
  assert.equal(getStats(c, 'c').xp, 10 + SEZON_ODULLERI[2])
  assert.equal(sampiyonlukSayisi(c, 'a'), 1)
  assert.equal(kapanis.sonSampiyon.user_jid, 'a')

  assert.deepEqual(sezonDurumu({ chatJid: c, now: sonra }).kapanan, [])
  assert.equal(getStats(c, 'a').xp, 30 + SEZON_ODULLERI[0])
})

test('borsa adımı: beklenen fiyat değişmez, hisse adları çözülür', () => {
  for (const h of HISSELER) {
    for (const { carpan } of HAVALAR) {
      for (const piyasa of [-1, 1]) {
        // Salınım simetrik: bütün sonuçların ortalaması piyasa payını bırakır,
        // o pay da -1 ve 1'in toplamında sıfırlanır.
        let toplam = 0
        for (let r = 0; r <= 2000; r++) {
          for (const p of [piyasa, -piyasa]) {
            toplam += fiyatAdimi(100, h, { carpan, piyasa: p }, (n) => (n === 2001 ? r : 1)).fiyat
          }
        }
        assert.ok(Math.abs(toplam / 4002 - 100) < 1e-9, h.kod)
      }
    }

    // Haber yönsüz: iyi ve kötü haberin ortalaması fiyatı değiştirmez.
    const haberli = (yon) => fiyatAdimi(100, h, { carpan: 1, piyasa: 0 }, (n) => (n === 2 ? yon : n === 2001 ? 1000 : 0))
    assert.equal(haberli(1).haber, h.iyi)
    assert.equal(haberli(0).haber, h.kotu)
    assert.ok(Math.abs((haberli(1).fiyat + haberli(0).fiyat) / 2 - 100) < 1e-9, h.kod)
  }
  assert.equal(hisseBul('ÇAY').kod, 'cay')
  assert.equal(hisseBul('yok'), null)
})

test('borsa: alım satımda komisyon kesilir, fiyat aynıysa zarar edilir', () => {
  const k = kisi(1000)
  const hisse = hisseBul('muz')
  const sabit = (n) => (n - 1) / 2
  const s = { ...k, hisse, now: T, rnd: sabit }

  assert.deepEqual(borsaAl({ ...s, miktar: 1001 }), { yetersiz: true, xp: 1000 })
  assert.deepEqual(borsaAl({ ...s, miktar: 1000 }), { fiyat: 100, komisyon: 20, xp: 0 })

  const p = borsaDurumu({ ...s }).portfoy[0]
  assert.equal(p.deger, 980)
  assert.equal(p.maliyet, 1000)

  assert.equal(borsaSat({ ...s, miktar: 981 }).yetersiz, true)
  const yarim = borsaSat({ ...s, miktar: 490 })
  assert.equal(yarim.xp, 480)
  assert.equal(borsaDurumu({ ...s }).portfoy[0].maliyet, 500)

  const son = borsaSat({ ...s })
  assert.equal(son.satilan, 490)
  assert.deepEqual(borsaDurumu({ ...s }).portfoy, [])
  assert.equal(getStats(k.chatJid, k.userJid).xp, 960)
  assert.deepEqual(borsaSat({ ...s }), { yok: true })
})

test('borsa: en sert adım ve en kötü haber fiyatı sıfırın altına indirmez', () => {
  for (const h of HISSELER) {
    const dip = fiyatAdimi(100, h, { carpan: 2, piyasa: -1 }, () => 0)
    assert.equal(dip.haber, h.kotu)
    assert.ok(dip.fiyat > 0, h.kod)
  }
})

test('borsa havası: aynı adımda aynı, altı saat içinde değişmez', () => {
  const ilk = 24 * 1000
  assert.equal(piyasaHavasi('g@g.us', ilk), piyasaHavasi('g@g.us', ilk + 23))
  const gorulen = new Set()
  for (let i = 0; i < 200; i++) gorulen.add(piyasaHavasi('g@g.us', i * 24))
  assert.equal(gorulen.size, HAVALAR.length)
})

test('borsa: fiyat adım adım ilerler, birikim sınırlı, batan hisse sıfırlar, haber görünür', () => {
  const k = kisi(1000)
  const hisse = hisseBul('roket')
  const dusus = () => 0
  borsaDurumu({ ...k, now: T, rnd: dusus })
  borsaAl({ ...k, hisse, miktar: 100, now: T, rnd: dusus })

  const fiyat = (d) => d.hisseler.find((h) => h.kod === 'roket')
  const baslangic = fiyat(borsaDurumu({ ...k, now: T, rnd: dusus })).fiyat
  const birAdim = borsaDurumu({ ...k, now: T + ADIM_MS, rnd: dusus })
  assert.ok(fiyat(birAdim).fiyat < baslangic)
  assert.equal(birAdim.portfoy.length, 1)
  // Hepsi aynı adımda haber aldı: liste üç haberle sınırlı.
  assert.equal(birAdim.haberler.length, 3)
  assert.ok(birAdim.haberler.includes(hisseBul('muz').kotu))

  // Sürekli düşüşte 48 saat içinde batar: pay silinir, hisse 100'den açılır.
  const batik = borsaDurumu({ ...k, now: T + 200 * SAAT_MS, rnd: dusus })
  assert.deepEqual(batik.portfoy, [])
  assert.ok(fiyat(batik).fiyat >= 5)
})

test('kartlar: numaralar benzersiz, her kart çekilebilir, nadir olan az çıkar', () => {
  const hepsi = SETLER.flatMap((s) => s.kartlar)
  assert.deepEqual(hepsi.map((k) => k.no), hepsi.map((_, i) => i + 1))
  assert.equal(kartBul(1).ad, 'Simit')
  assert.equal(kartBul(99), null)

  for (const set of SETLER) {
    const gorulen = {}
    for (let r = 0; r < setCekisi(set); r++) {
      const k = kartCek(set, () => r)
      gorulen[k.no] = (gorulen[k.no] || 0) + 1
    }
    assert.equal(Object.keys(gorulen).length, set.kartlar.length)
    assert.equal(gorulen[set.kartlar.at(-1).no], 1)
  }
})

test('kart: key verir, takas edilir, set ödülü kartları harcar', () => {
  const k = kisi(500)
  const set = SETLER[0]
  for (const kart of set.kartlar) ac(k, { kart: kart.no })
  ac(k, { kart: 1 })
  assert.equal(kartlariOku(k.chatJid, k.userJid).find((x) => x.no === 1).adet, 2)

  assert.deepEqual(kartVer({ chatJid: k.chatJid, kaynak: 'a', hedef: 'b', no: 1 }), { verildi: true })
  assert.deepEqual(kartVer({ chatJid: k.chatJid, kaynak: 'b', hedef: 'a', no: 2 }), { yok: true })
  assert.deepEqual(kartlariOku(k.chatJid, 'b'), [{ no: 1, adet: 1 }])

  assert.deepEqual(setTamamla({ ...k, set: SETLER[1] }).eksik, SETLER[1].kartlar)
  const once = getStats(k.chatJid, k.userJid).xp
  assert.equal(setTamamla({ ...k, set }).xp, once + set.odul)
  assert.deepEqual(kartlariOku(k.chatJid, k.userJid), [])
  assert.equal(setTamamla({ ...k, set }).eksik.length, set.kartlar.length)
})

test('vitrin: ürün haftaya bağlı, kartları gerçek nadir kart', () => {
  assert.equal(vitrinUrunu('2026-11-02'), vitrinUrunu('2026-11-02'))
  for (const u of VITRIN.filter((v) => v.odul.kart)) {
    assert.ok(u.ad.endsWith(kartBul(u.odul.kart).ad), u.ad)
    assert.equal(kartBul(u.odul.kart).agirlik, 1, u.ad)
  }
})

test('vitrin: stok tükenir, kişi başı bir, XP yetmeyen stok yakmaz, hafta değişince yenilenir', () => {
  const c = yeniGrup()
  const urun = { ad: 'x', fiyat: 100, stok: 2, odul: { etiket: 'x' } }
  const al = (userJid, vitrinHafta = 'h1') =>
    kasaAc({ chatJid: c, userJid, kasa: urun, cek: () => urun.odul, vitrinHafta, now: T })
  for (const u of ['a', 'b', 'c']) addXp({ chatJid: c, userJid: u, amount: 300, at: T })

  assert.deepEqual(al('z'), { yetersiz: true, xp: 0 })
  assert.equal(vitrinKalan(c, 'h1', 2), 2)

  assert.equal(al('a').xp, 200)
  assert.deepEqual(al('a'), { zatenAldin: true })
  assert.equal(al('b').xp, 200)
  assert.deepEqual(al('c'), { tukendi: true })
  assert.equal(vitrinKalan(c, 'h1', 2), 0)
  assert.equal(getStats(c, 'c').xp, 300)

  assert.equal(al('c', 'h2').xp, 200)
  assert.equal(vitrinKalan(c, 'h2', 2), 1)
})
