// Web Push teşhisi: kayıtlı abonelikleri sayar, istenirse bir kişinin cihazlarına deneme
// push'u atar ve push servisinin cevabını yazar. Adresler kısaltılır: tam adres aboneliğin anahtarıdır.
//   node scripts/push-test.js            durum
//   node scripts/push-test.js 905xxxxxxxxx   o numaranın (ya da LID'in) cihazlarına deneme
//   node scripts/push-test.js hepsi           bütün cihazlara deneme
import { getDb } from '../lib/db.js'
import { pushDene, vapid } from '../panel/push.js'

const db = getDb()
const kisa = (adres) => {
  const u = new URL(adres)
  return `${u.hostname}…${adres.slice(-6)}`
}
const ayar = (a) => db.prepare('SELECT deger FROM ayar WHERE anahtar = ?').get(a)?.deger ?? ''

console.log('panel_adres (VAPID sub):', ayar('panel_adres') || '(yok, mailto kullanılıyor)')
console.log('VAPID anahtarı:', ayar('vapid_ozel') ? 'var' : 'yok (ilk abonelikte üretilir)')
const abonelikler = db.prepare('SELECT endpoint, numara, lid, zaman FROM sosyal_push ORDER BY zaman').all()
console.log(`Kayıtlı cihaz: ${abonelikler.length}`)
for (const a of abonelikler) {
  // Cihazın hangi panel hesabına bağlandığı: push bu eşleşmeyle bulunur.
  const ad = db.prepare(`SELECT i.ad AS ad FROM panel_hesap h LEFT JOIN isimler i ON i.user_jid = h.user_jid
    WHERE (h.numara <> '' AND h.numara = ?) OR (h.lid <> '' AND h.lid = ?) LIMIT 1`).get(a.numara, a.lid)
  console.log(`  ${kisa(a.endpoint)}  numara=${a.numara ? `…${a.numara.slice(-4)}` : '-'}  lid=${a.lid ? `…${a.lid.slice(-4)}` : '-'}  hesap=${ad ? (ad.ad || 'adsız') : 'YOK'}  ${new Date(a.zaman).toLocaleString('tr-TR')}`)
}

const arg = process.argv[2] ?? ''
const numara = arg.replace(/\D/g, '')
if (arg) {
  vapid()
  const hedef = arg === 'hepsi' ? abonelikler : abonelikler.filter((a) => a.numara === numara || a.lid === numara)
  if (!hedef.length) console.log(`\n${numara} için kayıtlı cihaz yok: o cihazda bildirim izni sunucuya ulaşmamış.`)
  for (const a of hedef) {
    try {
      const s = await pushDene(a.endpoint)
      console.log(`\n${kisa(a.endpoint)} -> ${s.status} ${s.sebep || ''}`)
      console.log(s.status === 201 || s.status === 200 ? 'Servis kabul etti, telefona birkaç saniyede düşmeli.' : 'Servis reddetti, bu çıktıyı gönder.')
    } catch (err) {
      console.log(`\n${kisa(a.endpoint)} -> istek atılamadı: ${err.message}`)
    }
  }
}
