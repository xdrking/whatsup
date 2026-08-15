import { jidNormalizedUser } from '@whiskeysockets/baileys'

// Baileys yanıtlanan mesajın YAZARININ adını vermez; contextInfo yalnızca JID
// taşır. Ama o kişinin mesajı bir noktada bu bottan geçmiştir ve pushName o
// mesajda vardır. Bu yüzden görülen adlar burada tutulur.
//
// Kasıtlı olarak kalıcı değil: disk yazmak, grup üyelerinin adlarını bota ait
// bir dosyada biriktirmek demektir. Süreç yeniden başladığında harita boşalır,
// çağıran taraf geri düşüş adını kullanır.
const MAX_ENTRIES = 500

const names = new Map()

function keyOf(jid) {
  if (!jid) return ''
  try {
    return jidNormalizedUser(jid)
  } catch {
    // jidNormalizedUser bozuk JID'de hata atar; ham değer yine de anahtar olur.
    return jid
  }
}

/** Gelen mesajdaki pushName'i sonraki aramalar için saklar. */
export function rememberName(jid, name) {
  const key = keyOf(jid)
  const clean = (name || '').trim()
  if (!key || !clean) return

  // Yeniden ekleme kaydı Map'in sonuna taşır: en eski kayıt hep ilk sıradadır.
  names.delete(key)
  names.set(key, clean)

  if (names.size > MAX_ENTRIES) {
    names.delete(names.keys().next().value)
  }
}

/** Bilinen adı döner; kişi hiç görülmediyse boş string. */
export function lookupName(jid) {
  return names.get(keyOf(jid)) || ''
}
