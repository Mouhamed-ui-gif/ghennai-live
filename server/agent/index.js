/**
 * نقطة دخول طبقة الـAgent الجديدة (Phase 1).
 * تُصدّر كل المكونات الأساسية للاستخدام من المسارات والـOrchestrator (Phase 2).
 */
export * as agentStates from './agentStates.js'
export * as eventBus from './eventBus.js'
export * as taskStore from './taskStore.js'
export * as permissionManager from './permissionManager.js'
export * as toolManager from './toolManager.js'
export * as providerRegistry from './providers/registry.js'
export { ProviderAdapter } from './providers/base.js'
export { OllamaProvider } from './providers/ollamaProvider.js'
export { OpenCodeAdapter } from './providers/opencodeAdapter.js'
export { CodexAdapter } from './providers/codexAdapter.js'
