// deno-coverage-ignore-file
import amqp from 'amqp'
import { dirname, fromFileUrl, join } from '@std/path'

/**
 * Harness for the tests that need to control WHICH process boots WHEN against a real RabbitMQ — the
 * only way to exercise "the server started before any worker ever did", since `project()` is
 * memoized per process and the execution mode comes from the environment.
 *
 * Every probe is a throwaway project (`@probe/asyncmq-<random>`) with its own temp `cwd`, so its
 * queues cannot collide with anything else on the broker (a developer's local RabbitMQ usually
 * holds real projects' queues too). `cleanup()` deletes ONLY that project's queues by name; it
 * never purges the broker and never touches the shared exchanges.
 */

export const AMQP_URI = Deno.env.get('AMQP_URI') || 'amqp://guest:guest@localhost:5672/'

const HERE = dirname(fromFileUrl(import.meta.url))
const FIXTURE = join(HERE, 'probe.fixture.ts')
const LIBRARY_CONFIG = join(HERE, '../../../../deno.jsonc')

/** The variables a child `deno` needs to find itself, its cache and a temp dir. */
function baseEnv(): Record<string, string> {
  const keep = ['PATH', 'HOME', 'DENO_DIR', 'TMPDIR', 'LANG', 'XDG_CACHE_HOME']
  return Object.fromEntries(keep.flatMap((key) => {
    const value = Deno.env.get(key)
    return value === undefined ? [] : [[key, value]]
  }))
}

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type ProbeProcess = {
  /** Every stdout/stderr line seen so far. */
  lines: string[]
  /** How many `PROBE_RUN` lines (cron executions) have been printed. */
  runs(): number
  /** Resolves when `predicate` holds, or rejects after `timeoutMs` with the output so far. */
  until(predicate: () => boolean, timeoutMs: number, what: string): Promise<void>
  stop(): Promise<void>
  /** Lines that mean the broker rejected a declaration or a channel died (e.g. a `406`). */
  brokerErrors(): string[]
}

/** Deletes `names` on a throwaway channel each (a missing queue closes its channel: ignored). */
async function deleteQueues(names: string[]) {
  const connection = await amqp.connect(AMQP_URI)
  try {
    await Promise.all(names.map(async (name) => {
      const channel = await connection.createChannel()
      channel.on('error', () => {})
      await channel.deleteQueue(name).catch(() => {})
      await channel.close().catch(() => {})
    }))
  } finally {
    await connection.close().catch(() => {})
  }
}

async function createProbe() {
  const project = `@probe/asyncmq-${crypto.randomUUID().slice(0, 8)}`
  const dir = await Deno.makeTempDir({ prefix: 'asyncmq-probe-' })
  await Deno.writeTextFile(join(dir, 'deno.json'), JSON.stringify({ name: project }))

  const processes: ProbeProcess[] = []
  /** Extra queue names a test created, deleted on cleanup (always under this project's prefix). */
  const extraQueues: string[] = []
  const SUFFIXES = ['', '.dlq', '.schq', '.cron.schq']

  return {
    project,
    dir,

    /** `<project>.<name>`, as the library names an internal queue; deleted on cleanup. */
    internalQueue(name: string, suffix = ''): string {
      for (const extra of SUFFIXES) extraQueues.push(`${project}.${name}${extra}`)
      return `${project}.${name}${suffix}`
    },

    /** `<project>.zanix.worker.soft` and friends: the queue names this project's `soft` cron uses. */
    queue(suffix = ''): string {
      return `${project}.zanix.worker.soft${suffix}`
    },

    async spawn(
      role: 'server' | 'worker',
      env: Record<string, string> = {},
    ): Promise<ProbeProcess> {
      const command = new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', '--no-lock', '--config', LIBRARY_CONFIG, FIXTURE],
        cwd: dir,
        // A clean environment: a child inherits the test process's, and other suites in the same
        // run set variables (`ZANIX_WORKER_EXECUTION`, `REDIS_URI`, ...) that would silently turn
        // the "server" into a worker. Only what `deno` itself needs, plus this probe's own.
        clearEnv: true,
        env: { ...baseEnv(), AMQP_URI, PROBE_ROLE: role, ...env },
        stdout: 'piped',
        stderr: 'piped',
      })
      const child = command.spawn()
      const lines: string[] = []
      const pump = async (stream: ReadableStream<Uint8Array>) => {
        const decoder = new TextDecoder()
        let pending = ''
        for await (const chunk of stream) {
          pending += decoder.decode(chunk, { stream: true })
          const parts = pending.split('\n')
          pending = parts.pop() ?? ''
          for (const part of parts) if (part.trim()) lines.push(part)
        }
      }
      const pumping = Promise.all([pump(child.stdout), pump(child.stderr)])

      const process: ProbeProcess = {
        lines,
        runs: () => lines.filter((line) => line.startsWith('PROBE_RUN')).length,
        async until(predicate, timeoutMs, what) {
          const deadline = Date.now() + timeoutMs
          while (Date.now() < deadline) {
            if (predicate()) return
            // deno-lint-ignore no-await-in-loop
            await wait(100)
          }
          throw new Error(`Timed out waiting for ${what}. Output so far:\n${lines.join('\n')}`)
        },
        brokerErrors: () =>
          lines.filter((line) =>
            /PRECONDITION|406|channel (closed|ended)|Channel closed/i.test(line)
          ),
        async stop() {
          try {
            child.kill('SIGTERM')
          } catch { /* already gone */ }
          await child.status.catch(() => {})
          await pumping.catch(() => {})
        },
      }
      processes.push(process)
      await process.until(() => lines.includes('PROBE_READY'), 30_000, `${role} to boot`)
      return process
    },

    /** The message count of `name`, or `null` when the queue does not exist. */
    async messageCount(name: string): Promise<number | null> {
      const connection = await amqp.connect(AMQP_URI)
      try {
        const channel = await connection.createChannel()
        channel.on('error', () => {})
        try {
          return (await channel.checkQueue(name)).messageCount
        } catch {
          return null
        }
      } finally {
        await connection.close().catch(() => {})
      }
    },

    /** Stops every process and deletes this project's queues (and only those). */
    async cleanup(): Promise<void> {
      await Promise.all(processes.map((process) => process.stop()))
      const worker = (queue: string) => `${project}.zanix.worker.${queue}`
      const names = ['soft', 'moderate', 'intensive'].flatMap((queue) =>
        SUFFIXES.map((suffix) => `${worker(queue)}${suffix}`)
      )
      await deleteQueues([...names, ...extraQueues])
      await Deno.remove(dir, { recursive: true }).catch(() => {})
    },
  }
}

export type Probe = Awaited<ReturnType<typeof createProbe>>

/** Entry point: `await Probe.create()`. */
export const Probe = { create: createProbe }
