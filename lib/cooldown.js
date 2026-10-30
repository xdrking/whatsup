// Komut spam koruması: aynı kişi aynı komutu bekleme süresi dolmadan tekrar
// yazarsa komut çalışmaz. Bellekte tutulur; bot yeniden başlarsa sıfırlanır
// (zararsız, en kötü ihtimalle bir kez fazladan çalışır).
const VARSAYILAN_SN = 3

const bekleyenler = new Map()

// Harita sınırsız büyümesin: belli bir boyuttan sonra süresi dolanlar atılır.
const TEMIZLIK_ESIGI = 500

function temizle(now) {
  for (const [anahtar, kayit] of bekleyenler) {
    if (kayit.until <= now) bekleyenler.delete(anahtar)
  }
}

/**
 * Komut çalışabilir mi? Çalışabiliyorsa bekleme süresini başlatır.
 *
 * @returns {{ ok: true } | { ok: false, kalanSn: number, uyar: boolean }}
 *   `uyar` yalnızca bekleme penceresindeki ilk reddedilen denemede true olur:
 *   her spam denemesine "bekle" yazmak da spam olurdu.
 */
export function checkCooldown({ userJid, command, now = Date.now() }) {
  const sureSn = command.cooldown ?? VARSAYILAN_SN
  if (sureSn <= 0) return { ok: true }

  const anahtar = `${userJid}|${command.name}`
  const kayit = bekleyenler.get(anahtar)

  if (kayit && kayit.until > now) {
    const uyar = !kayit.uyarildi
    kayit.uyarildi = true
    return { ok: false, kalanSn: Math.ceil((kayit.until - now) / 1000), uyar }
  }

  if (bekleyenler.size >= TEMIZLIK_ESIGI) temizle(now)
  bekleyenler.set(anahtar, { until: now + sureSn * 1000, uyarildi: false })

  return { ok: true }
}
