// -----------------------------------------------------------------------------
// Parse a cron field into a Set of allowed values.
// Supports: *, ranges (a-b), lists (a,b,c), steps (*/n), a-b/n
// -----------------------------------------------------------------------------

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

export function nextCronDate(
  cronExpr: string,
  fromDate: Date = new Date(),
): Date {
  const [secF, minF, hourF, dayF, monthF, dowF] = cronExpr.trim().split(/\s+/)

  const seconds = parseField(secF, 0, 59)
  const minutes = parseField(minF, 0, 59)
  const hours = parseField(hourF, 0, 23)
  const days = parseField(dayF, 1, 31)
  const months = parseField(monthF, 1, 12)
  const dows = parseField(dowF, 0, 6)

  const dayOfMonthIsWildcard = dayF === '*'
  const dayOfWeekIsWildcard = dowF === '*'

  const date = new Date(fromDate.getTime() + 1000)

  while (true) {
    const y = date.getUTCFullYear()
    const mo = date.getUTCMonth() + 1
    const d = date.getUTCDate()
    const h = date.getUTCHours()
    const mi = date.getUTCMinutes()
    const s = date.getUTCSeconds()
    const dow = date.getUTCDay()

    // ----- MONTH -----
    if (!months.has(mo)) {
      const sorted = [...months].sort((a, b) => a - b)
      let next = sorted.find((v) => v > mo)

      if (next === undefined) {
        next = sorted[0]
        date.setUTCFullYear(y + 1, next - 1, 1)
      } else {
        date.setUTCFullYear(y, next - 1, 1)
      }
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
      const sorted = [...hours].sort((a, b) => a - b)
      let next = sorted.find((v) => v > h)

      if (next === undefined) {
        next = sorted[0]
        date.setUTCDate(d + 1)
      }
      date.setUTCHours(next, 0, 0, 0)
      continue
    }

    // ----- MINUTE -----
    if (!minutes.has(mi)) {
      const sorted = [...minutes].sort((a, b) => a - b)
      let next = sorted.find((v) => v > mi)

      if (next === undefined) {
        next = sorted[0]
        date.setUTCHours(h + 1, next, 0, 0)
      } else {
        date.setUTCMinutes(next, 0, 0)
      }
      continue
    }

    // ----- SECOND -----
    if (!seconds.has(s)) {
      const sorted = [...seconds].sort((a, b) => a - b)
      let next = sorted.find((v) => v > s)

      if (next === undefined) {
        next = sorted[0]
        date.setUTCMinutes(mi + 1, next, 0)
      } else {
        date.setUTCSeconds(next, 0)
      }
      continue
    }

    return date
  }
}
