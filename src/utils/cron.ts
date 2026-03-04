// -----------------------------------------------------------------------------
// Parse a cron field into a Set of allowed values.
// Supports: *, ranges (a-b), lists (a,b,c), steps (*/n), a-b/n
// -----------------------------------------------------------------------------

import logger from '@zanix/logger'
import { setImmediate } from 'node:timers'

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>()

  // "*" means every possible value
  if (field === '*') {
    for (let i = min; i <= max; i++) values.add(i)
    return values
  }

  // Split lists
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      // Step syntax
      const [range, stepStr] = part.split('/')
      const step = parseInt(stepStr, 10)

      let start = min
      let end = max

      if (range !== '*') {
        const [rStart, rEnd] = range.split('-').map(Number)
        start = rStart
        end = rEnd
      }

      for (let i = start; i <= end; i += step) values.add(i)
    } else if (part.includes('-')) {
      // Range syntax
      const [start, end] = part.split('-').map(Number)
      for (let i = start; i <= end; i++) values.add(i)
    } else {
      // Single value
      values.add(parseInt(part, 10))
    }
  }

  return values
}

// -----------------------------------------------------------------------------
// Main: Compute the next execution timestamp (ms) from a 6-field cron expression.
// Fields: second minute hour day month weekday
// -----------------------------------------------------------------------------
export async function nextCronDate(
  cronExpr: string,
  fromDate: Date = new Date(),
): Promise<Date | undefined> {
  const [secF, minF, hourF, dayF, monthF, dowF] = cronExpr.trim().split(/\s+/)

  const seconds = parseField(secF, 0, 59)
  const minutes = parseField(minF, 0, 59)
  const hours = parseField(hourF, 0, 23)
  const days = parseField(dayF, 1, 31)
  const months = parseField(monthF, 1, 12)
  const dows = parseField(dowF, 0, 6)

  // 🔒 Basic validation
  if (
    !seconds.size ||
    !minutes.size ||
    !hours.size ||
    !days.size ||
    !months.size ||
    !dows.size
  ) {
    logger.error('Invalid cron expression: empty field', cronExpr)
    return
  }

  // ⚡ Pre-sorting (ANTES del loop)
  const secArr = [...seconds].sort((a, b) => a - b)
  const minArr = [...minutes].sort((a, b) => a - b)
  const hourArr = [...hours].sort((a, b) => a - b)
  const monthArr = [...months].sort((a, b) => a - b)

  const dayOfMonthIsWildcard = dayF === '*'
  const dayOfWeekIsWildcard = dowF === '*'

  const date = new Date(fromDate.getTime() + 1000)

  const MAX_ITERATIONS = 500_000
  const YIELD_EVERY = 10_000

  let guard = 0

  while (guard++ < MAX_ITERATIONS) {
    // 🧠 No bloquear Node
    if (guard % YIELD_EVERY === 0) {
      // deno-lint-ignore no-await-in-loop
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    const y = date.getUTCFullYear()
    const mo = date.getUTCMonth() + 1
    const d = date.getUTCDate()
    const h = date.getUTCHours()
    const mi = date.getUTCMinutes()
    const s = date.getUTCSeconds()
    const dow = date.getUTCDay()

    // ----- MONTH -----
    if (!months.has(mo)) {
      const next = monthArr.find((v) => v > mo)
      if (next === undefined) {
        date.setUTCFullYear(y + 1, monthArr[0] - 1, 1)
      } else {
        date.setUTCFullYear(y, next - 1, 1)
      }
      date.setUTCHours(0, 0, 0, 0)
      continue
    }

    // ----- VALIDAR día real del mes -----
    const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    if (d > daysInMonth) {
      date.setUTCDate(1)
      date.setUTCMonth(mo)
      date.setUTCHours(0, 0, 0, 0)
      continue
    }

    // ----- DAY (cron OR rule) -----
    let dayMatch = false
    if (!dayOfMonthIsWildcard && days.has(d)) dayMatch = true
    if (!dayOfWeekIsWildcard && dows.has(dow)) dayMatch = true
    if (dayOfMonthIsWildcard && dayOfWeekIsWildcard) dayMatch = true

    if (!dayMatch) {
      date.setUTCDate(d + 1)
      date.setUTCHours(0, 0, 0, 0)
      continue
    }

    // ----- HOUR -----
    if (!hours.has(h)) {
      const next = hourArr.find((v) => v > h)
      if (next === undefined) {
        date.setUTCDate(d + 1)
        date.setUTCHours(hourArr[0], 0, 0, 0)
      } else {
        date.setUTCHours(next, 0, 0, 0)
      }
      continue
    }

    // ----- MINUTE -----
    if (!minutes.has(mi)) {
      const next = minArr.find((v) => v > mi)
      if (next === undefined) {
        date.setUTCHours(h + 1, minArr[0], 0, 0)
      } else {
        date.setUTCMinutes(next, 0, 0)
      }
      continue
    }

    // ----- SECOND -----
    if (!seconds.has(s)) {
      const next = secArr.find((v) => v > s)
      if (next === undefined) {
        date.setUTCMinutes(mi + 1, secArr[0], 0)
      } else {
        date.setUTCSeconds(next, 0)
      }
      continue
    }

    return date
  }

  logger.error('Invalid cron expression: not supported', cronExpr)
}
