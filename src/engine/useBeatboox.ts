import { useSyncExternalStore } from 'react'
import { controller } from './controller.ts'

export function useBeatboox() {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
  return {
    state,
    actions: controller.actions,
    getLive: controller.getLive,
    getPlayhead: controller.getPlayhead,
    visualLevel: controller.visualLevel,
  }
}

export type Beatboox = ReturnType<typeof useBeatboox>
