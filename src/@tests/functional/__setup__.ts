import type { MessageInfo, QueueOptions } from 'typings/queues.ts'

import { ZanixCoreAsyncMQProvider } from 'modules/rabbitmq/provider/mod.ts'
import { Interactor, ZanixInteractor } from '@zanix/server'
import { Subscriber } from 'modules/subscribers/decorators/base.ts'
import { ZanixSubscriber } from 'modules/subscribers/base.ts'

import { BaseRTO, IsString, isUUID } from '@zanix/validator'
import { assert, assertEquals } from '@std/assert'
import { ZanixCoreWorkerProvider } from 'modules/worker/provider.ts'
import { dirname, join } from '@std/path'

console.info = () => {}
console.warn = () => {}

const dependencies = async () => {
  Deno.env.set('AMQP_URI', 'amqp://guest:guest@localhost:5672/')

  await import('jsr:@zanix/datamaster@0.x/core')
  await import('../../modules/rabbitmq/defs.ts')
}

export const registerProvider = async () => {
  await dependencies()
  return new ZanixCoreAsyncMQProvider()
}

export const registerWorkerProvider = async () => {
  await dependencies()
  return new ZanixCoreWorkerProvider()
}

export const registerQueue = async (
  queue: string,
  // deno-lint-ignore no-explicit-any
  options?: QueueOptions & { callback?: (info: any) => void },
) => {
  @Interactor()
  class _Interactor extends ZanixInteractor {
    public getCtx() {
      return this.context.id
    }
  }
  class Rto extends BaseRTO {
    @IsString({ expose: true })
    accessor message!: string
  }

  let calls = 0
  let errors = 0
  const { callback, ...opts } = options || {}
  await new Promise((resolve) => {
    @Subscriber({ Interactor: _Interactor, rto: Rto, queue: { topic: queue, settings: opts } })
    class _Subscriber extends ZanixSubscriber<_Interactor> {
      public onmessage(data: { message: string }, info: MessageInfo) {
        assertEquals(data.message, 'hello queue')
        assert(info.requeuedFromDeadLetter ? info.attempt === 2 : info.attempt >= 0)
        assert(isUUID(this.interactor.getCtx()))
        calls++
        callback?.(info)

        if (Date.now() - Number(info.messageId) > 5500) return
        setTimeout(() => {
          resolve(true)
        }, info.cron ? 10000 : 500) // wait until ack
      }

      public override onerror(data: { message: string }, error: unknown): void {
        assert(!!error)
        assertEquals(data.message, 'hello queue')
        errors++
      }
    }
  })

  return { calls, errors }
}

export const childSpawn = (id: string = '') => {
  const file = join(dirname(import.meta.url), '../../modules/worker/e-process.ts')

  const command = new Deno.Command('deno', {
    args: ['run', '-A', file],
    env: {
      AMQP_URI: 'amqp://guest:guest@localhost:5672/',
      id,
    },
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  })

  return command.spawn()
}

export const killChild = async (child: Deno.ChildProcess | null) => {
  if (!child) return

  try {
    child.stdin?.close()
    child.kill('SIGTERM')
    await child.status
  } finally {
    child = null
  }
}
