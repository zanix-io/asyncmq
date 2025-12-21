import type { HandlerContext, ScopedContext } from '@zanix/server'
import { generateUUID } from '@zanix/helpers'

export const prepareContext = (getContext: (id: string) => ScopedContext, contextId?: string) => {
  const scopedContext = contextId ? getContext(contextId) : undefined
  const context: Omit<HandlerContext, 'req' | 'url'> = {
    ...scopedContext,
    id: scopedContext?.id || generateUUID(),
    cookies: scopedContext?.cookies || {},
    locals: scopedContext?.locals || {},
    payload: { params: {}, search: {}, body: {} },
  }

  return context
}
