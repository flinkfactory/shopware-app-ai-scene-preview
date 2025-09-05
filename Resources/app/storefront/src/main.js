import AiScenePreviewPlugin from './plugin/ai-scene-preview.plugin';

const PluginManager = window.PluginManager;

PluginManager.register('AiScenePreview', AiScenePreviewPlugin, '[data-ai-scene-preview-trigger]');