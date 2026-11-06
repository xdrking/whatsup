// .görev tanımları ve günün görevlerinin seçimi. Saf; yazma lib/stats.js'tedir.
import { fnv1a } from './hash.js'

export const GUNLUK_GOREV = 3

// `anahtar`, lib/stats.js'te ilerletilen sayacın adıdır.
export const GOREVLER = [
  { anahtar: 'mesaj', hedef: 20, odul: 400, etiket: '20 mesaj yaz' },
  { anahtar: 'oyun', hedef: 3, odul: 750, etiket: 'Oyunlardan 3 kez XP kazan' },
  { anahtar: 'kumar', hedef: 5, odul: 600, etiket: '5 kez kumar oyna' },
  { anahtar: 'cark', hedef: 1, odul: 300, etiket: 'Çarkı çevir' },
  { anahtar: 'soygun', hedef: 1, odul: 500, etiket: '1 soygun dene' },
]

/** Görevler güne göre döner; aynı gün gruptaki herkese aynı görevler çıkar. */
export function gununGorevleri(gun) {
  const bas = fnv1a(gun) % GOREVLER.length
  return Array.from({ length: GUNLUK_GOREV }, (_, i) => GOREVLER[(bas + i) % GOREVLER.length])
}
