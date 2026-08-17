import { getTemporaryFolder } from '@zanix/helpers'
import { assertEquals, assertStringIncludes } from '@std/assert'
import { fromFileUrl, join } from '@std/path'

// Regression coverage for the `zanix new` silent-failure bug: `modules/rabbitmq/provider/setup.ts`
// used to call `readConfig()` at module load time (`export const project = readConfig().name`),
// so merely importing `@zanix/asyncmq` from a directory without a `deno.json`/`.jsonc` (e.g. one
// `zanix new` is scaffolding from scratch) threw during module evaluation, before any queueing
// feature was ever used. `project` is now a lazy, memoized function, so this must never fail here.
//
// This spawns a real `deno run` subprocess with `cwd` pointed at an empty directory — the actual
// scenario that broke, not a mock of `readConfig`.
Deno.test(
  'importing @zanix/asyncmq from a directory with no deno config does not throw',
  async () => {
    const fixture = fromFileUrl(
      new URL('./__fixtures__/import-empty-cwd.ts', import.meta.url),
    )

    const emptyCwd = join(getTemporaryFolder(import.meta.url), 'empty-cwd')
    await Deno.mkdir(emptyCwd, { recursive: true })

    try {
      const { code, stdout, stderr } = await new Deno.Command('deno', {
        args: ['run', '-A', fixture],
        cwd: emptyCwd,
      }).output()

      const stderrText = new TextDecoder().decode(stderr)
      assertEquals(
        code,
        0,
        `expected exit code 0, got ${code}. stderr:\n${stderrText}`,
      )
      assertStringIncludes(new TextDecoder().decode(stdout), 'IMPORTED_OK')
    } finally {
      await Deno.remove(emptyCwd, { recursive: true })
    }
  },
)
