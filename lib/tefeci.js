// .tefeci: üyeler birbirine faizli borç verir. Faiz tek seferliktir, vade sonunda borç
// borçlunun cüzdanından ve bankasından alınır. Yetmezse borç kalır, sonraki her mesajda
// gelen paradan tahsil edilir. .devret'i etkilemez (bot sahibinin kararı).
export const MIN_TEFECI = 1000
export const AZAMI_FAIZ = 100
export const AZAMI_VADE_SAATI = 72
export const TEKLIF_SURESI_MS = 10 * 60 * 1000

export function geriOdeme(anapara, faiz) {
  return anapara + Math.floor((anapara * faiz) / 100)
}
