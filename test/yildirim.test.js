// Yıldırım Kalesi: patlama, küre çarpanı, bedava dönüş, beklenen dönüş ve panel.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.LOG_LEVEL = 'silent'
process.env.STATS_DB = ':memory:'

const {
  AZAMI_KAT, BONUS_FIYATI, DAGINIK, donus, EN_AZ, kureMi, odemeKati, patlayanlar, SATIR, SEMBOLLER, SUTUN, yildirimCevir,
} = await import('../lib/yildirim.js')
const { getDb } = await import('../lib/db.js')
const { getStats, xpAyarla } = await import('../lib/stats.js')
const { kumarMotoru } = await import('../panel/kumar.js')
const { oyunSayfasi } = await import('../panel/oyunSayfalari.js')

/** Tohumlu rastgele (mulberry32): sonuç her çalıştırmada aynı. */
function tohumlu(tohum) {
  let a = tohum >>> 0
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
}

// Patlamayan dolgu: ilk sembol hiç yok, ötekiler en çok 4 kez geçer.
const dolgu = () => Array.from({ length: SUTUN }, (_, c) => Array.from({ length: SATIR }, (_, r) => SEMBOLLER[1 + ((c * SATIR + r) % (SEMBOLLER.length - 1))].s))

test('8+ aynı sembol öder ve patlar; küre ve fırtına patlamaz', () => {
  const [a] = SEMBOLLER
  const t = dolgu()
  for (let i = 0; i < EN_AZ; i += 1) t[Math.floor(i / SATIR)][i % SATIR] = a.s
  t[5][4] = 25
  t[5][3] = DAGINIK
  const p = patlayanlar(t)
  assert.equal(p.odemeler.length, 1)
  assert.equal(p.odemeler[0].kat, a.odeme[0])
  assert.equal(p.hucreler.length, EN_AZ)
  assert.equal(odemeKati(a.s, 10), a.odeme[1])
  assert.equal(odemeKati(a.s, 12), a.odeme[2])
  assert.equal(odemeKati(a.s, 7), 0)
})

test('küre düştüğü yerde kalır, kazandıran dönüşte toplamı kazancı çarpar', () => {
  const [a] = SEMBOLLER
  const t = dolgu()
  for (let i = 0; i < EN_AZ; i += 1) t[Math.floor(i / SATIR)][i % SATIR] = a.s
  t[5][4] = 25
  t[4][4] = 5
  const d = donus(tohumlu(3), false, t)
  assert.ok(d.kazanc >= a.odeme[0])
  const son = d.adimlar.at(-1).tahta
  assert.equal(son[5][4], 25, 'en alttaki küre yerinde kalır')
  assert.ok(d.kure >= 30)
  assert.ok(son.flat().filter(kureMi).length >= 2)
})

test('bonus doğrudan bedava dönüşle başlar, toplam çarpan hiç düşmez, el tavanı aşmaz', () => {
  const rnd = tohumlu(9)
  for (let i = 0; i < 40; i += 1) {
    const s = yildirimCevir(rnd, { bonus: true })
    assert.ok(s.bedava)
    let onceki = 0
    for (const d of s.bedava.donusler) {
      assert.ok(d.carpan >= onceki)
      onceki = d.carpan
      if (d.ham > 0) assert.equal(d.kazanc, d.ham * (d.carpan || 1))
    }
    assert.ok(s.kat <= AZAMI_KAT)
  }
})

test('beklenen dönüş: ana oyun ve bonus %90-100 arası', () => {
  const rnd = tohumlu(11)
  const n = 80_000
  let top = 0
  for (let i = 0; i < n; i += 1) top += yildirimCevir(rnd).carpan
  const rtp = top / n
  assert.ok(rtp > 0.88 && rtp < 1.02, `ana RTP ${rtp}`)
  const b = 4000
  let bt = 0
  for (let i = 0; i < b; i += 1) bt += yildirimCevir(rnd, { bonus: true }).carpan
  assert.ok(bt / b > 0.85 && bt / b < 1.08, `bonus RTP ${bt / b}`)
})

test('panel: çevirme ve bonus XP\'ye yazılır, makine sayfada', () => {
  const GRUP = 'y@g.us'
  const UYE = 'yuye@lid'
  getDb().prepare("INSERT OR REPLACE INTO ayar (anahtar, deger) VALUES ('bot_jid', 'bot@s.whatsapp.net')").run()
  xpAyarla({ chatJid: GRUP, userJid: UYE, miktar: 10_000_000 })
  let zaman = 1_000_000
  const m = kumarMotoru({ saat: () => zaman })
  const kim = { chat: GRUP, user: UYE }
  m.tekOyna(kim, { oyun: 'yıldırım', miktar: '1000' })
  const s = m.durum(kim).sonuc
  assert.equal(s.bahis, 1000)
  assert.equal(getStats(GRUP, UYE).xp, 10_000_000 + s.fark)
  const html = String(oyunSayfasi({ chat: GRUP, oyun: 'yıldırım', durum: { xp: 0, el: null, sonuc: s } }))
  assert.ok(html.includes('data-yildirim="') && html.includes('yk-tahta'))
  assert.equal(String(oyunSayfasi({ chat: GRUP, oyun: 'yıldırım', durum: { xp: 0, el: null, sonuc: null } })).match(/class="yk[ "]/g).length, SUTUN * SATIR)

  zaman += 1000
  m.tekOyna(kim, { oyun: 'yıldırım', miktar: '1000', secim: 'bonus' })
  const b = m.durum(kim).sonuc
  assert.equal(b.bahis, 1000 * BONUS_FIYATI)
  assert.equal(b.taban, 1000)
  assert.ok(b.sonuc.bedava)
})
