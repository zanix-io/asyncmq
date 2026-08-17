// Regression fixture for the `zanix new` silent-failure bug: importing this package used to
// eagerly run `readConfig()` (see `modules/rabbitmq/provider/setup.ts`'s own `project`) at
// module load time, which throws when `Deno.cwd()` has no `deno.json`/`.jsonc` — exactly the
// case for a project being scaffolded from scratch. Run from an empty `cwd` by the integration
// test alongside this file.
import '../../../../mod.ts'

// deno-lint-ignore deno-zanix-plugin/no-znx-console
console.log('IMPORTED_OK')
