import { Interactor, ProgramModule, ZanixInteractor } from '@zanix/server'
import { Queue } from 'modules/queues/decorators/base.ts'
import { ZanixQueue } from 'modules/queues/base.ts'
import { assert, assertEquals } from '@std/assert'
import { BaseRTO, IsString, isUUID } from '@zanix/validator'

console.info = () => {}
console.warn = () => {}

Deno.test({
  sanitizeOps: false,
  sanitizeResources: false,
  name: 'ZanixRabbitMQ provider should setup test queue',
  fn: async () => {
    Deno.env.set('AMQP_URI', 'amqp://guest:guest@localhost:5672/')
    const queue = 'test-queue'
    await import('jsr:@zanix/datamaster@0.x/core')
    await import('../../modules/rabbitmq/defs.ts')
    // deno-lint-ignore no-explicit-any
    const provider = ProgramModule.getProviders().get('asyncmq') as any
    setTimeout(() => {
      provider.enqueue(queue, { message: 'hello queue' }, { isInternal: true })
    }, 100)

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

    await new Promise((resolve) => {
      @Queue({ queue, Interactor: _Interactor, rto: Rto })
      class _Queue extends ZanixQueue<_Interactor> {
        // deno-lint-ignore no-explicit-any
        public onmessage(data: { message: string }, info: any) {
          assertEquals(data.message, 'hello queue')
          assert(info.attempt === 0)
          assert(isUUID(this.interactor.getCtx()))
          setTimeout(() => {
            resolve(true)
          }, 500) // wait until ack
        }
      }
    })
  },
})
