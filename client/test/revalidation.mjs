import { setTimeout as delay } from 'node:timers/promises'
export async function revalidatePage(evaluate) {
  await delay(2100)
  await evaluate("window.dispatchEvent(new Event('focus'))")
  await delay(100)
}
