import { assertEquals } from '@std/assert'
import { nextCronDate } from 'utils/cron.ts'

// Helper: freeze time input for deterministic tests
function d(str: string): Date {
  return new Date(str)
}

Deno.test('Cron expression: every 10 seconds', async () => {
  const next = await nextCronDate('*/10 * * * * *', d('2025-01-01T00:00:05Z'))
  assertEquals(next, new Date('2025-01-01T00:00:10Z'))
})

Deno.test('Cron expression: every Thursday at 12:00:00 UTC using ?', async () => {
  const next = await nextCronDate('0 0 12 ? * 4', d('2026-03-04T12:00:00Z'))
  assertEquals(next, new Date('2026-03-05T12:00:00.000Z'))
})

Deno.test('Cron expression: every second', async () => {
  const next = await nextCronDate('* * * * * *', d('2025-01-01T12:00:00Z'))
  assertEquals(next, new Date('2025-01-01T12:00:01Z'))
})

Deno.test('Cron expression: specific second/minute/hour', async () => {
  const next = await nextCronDate('15 30 14 * * *', d('2025-01-01T14:30:10Z'))
  assertEquals(next, new Date('2025-01-01T14:30:15Z'))
})

Deno.test('Cron expression: specific second/minute/hour – next day', async () => {
  const next = await nextCronDate('15 30 14 * * *', d('2025-01-01T14:30:16Z'))
  assertEquals(next, new Date('2025-01-02T14:30:15Z'))
})

Deno.test('Cron expression: day of week (Monday = 1)', async () => {
  // Jan 1, 2025 is Wednesday (3)
  const next = await nextCronDate('0 0 12 * * 1', d('2025-01-01T00:00:00Z'))
  assertEquals(next, new Date('2025-01-06T12:00:00Z'))
})

Deno.test('Cron expression: month change', async () => {
  // Cron restricted to February
  const next = await nextCronDate('0 0 0 * 2 *', d('2025-01-31T23:59:50Z'))
  assertEquals(next, new Date('2025-02-01T00:00:00Z'))
})

Deno.test('Cron expression: minute overflow', async () => {
  const next = await nextCronDate('0 */30 * * * *', d('2025-01-01T10:29:00Z'))
  assertEquals(next, new Date('2025-01-01T10:30:00Z'))
})

Deno.test('Cron expression: minute overflow into next hour', async () => {
  const next = await nextCronDate('0 */30 * * * *', d('2025-01-01T10:59:00Z'))
  assertEquals(next, new Date('2025-01-01T11:00:00Z'))
})

Deno.test('Cron expression: hour overflow into next day', async () => {
  const next = await nextCronDate('0 0 */12 * * *', d('2025-01-01T23:00:00Z'))
  assertEquals(next, new Date('2025-01-02T00:00:00Z'))
})

Deno.test('Cron expression: handle last second of minute', async () => {
  const next = await nextCronDate('59 * * * * *', d('2025-01-01T00:00:10Z'))
  assertEquals(next, new Date('2025-01-01T00:00:59Z'))
})

Deno.test('Cron expression: range of seconds', async () => {
  const next = await nextCronDate('10-20 * * * * *', d('2025-01-01T00:00:05Z'))
  assertEquals(next, new Date('2025-01-01T00:00:10Z'))
})

Deno.test('Cron expression: range of seconds – next minute', async () => {
  const next = await nextCronDate('10-20 * * * * *', d('2025-01-01T00:00:20Z'))
  assertEquals(next, new Date('2025-01-01T00:01:10Z'))
})

Deno.test('Cron expression: list of seconds', async () => {
  const next = await nextCronDate('5,15,25 * * * * *', d('2025-01-01T00:00:06Z'))
  assertEquals(next, new Date('2025-01-01T00:00:15Z'))
})

Deno.test('Cron expression: step with */n', async () => {
  const next = await nextCronDate('*/15 * * * * *', d('2025-01-01T00:00:31Z'))
  assertEquals(next, new Date('2025-01-01T00:00:45Z'))
})

Deno.test('Cron expression: day and weekday must both match', async () => {
  // Only 1st of month AND Monday allowed
  // Jan 1, 2024 = Monday (good test example)
  const next = await nextCronDate('0 0 0 1 * 1', d('2023-12-31T10:00:00Z'))
  assertEquals(next, new Date('2024-01-01T00:00:00Z'))
})

Deno.test('Cron expression: jump to next month if current month not allowed', async () => {
  const next = await nextCronDate('0 0 0 * 5 *', d('2025-03-01T00:00:00Z'))
  assertEquals(next, new Date('2025-05-01T00:00:00Z'))
})

Deno.test('Cron expression: complex cron example', async () => {
  // Every 20 seconds during 14:00–14:59 on days 1,10,20 and only in Feb or Mar
  const cron = '*/20 * 14 1,10,20 2-3 *'
  const next = await nextCronDate(cron, d('2025-02-01T13:59:50Z'))
  assertEquals(next, new Date('2025-02-01T14:00:00Z'))
})

Deno.test({
  name: 'Cron expression: every 6th day of the month at 12:00:00 UTC using ?',
  fn: async () => {
    const next = await nextCronDate('0 0 12 6 ? *', d('2026-03-04T12:00:00Z'))
    assertEquals(next, undefined)
  },
  sanitizeExit: false,
})
