import type { Settings } from './types';

export type ModelVerification = 'untested' | 'connected' | 'error';

export function getModelStatus(settings: Settings, verification: ModelVerification) {
  const configured = settings.provider === 'huggingface'
    ? Boolean(settings.model.trim() && (settings.hfToken.trim() || settings.hfTokenConfigured))
    : settings.provider === 'bedrock'
      ? Boolean(settings.model.trim() && settings.awsRegion.trim())
      : Boolean(settings.model.trim() && settings.endpoint.trim());

  if (!configured) return { configured: false, label: 'Model not configured' };
  if (verification === 'connected') return { configured: true, label: 'Model verified' };
  if (verification === 'error') return { configured: true, label: 'Model unavailable' };
  return { configured: true, label: 'Model configured - test required' };
}
