import { describe, expect, it } from 'vitest';
import { ENGINEERING_GUIDANCE, formatQueuedFeedback } from '../src/agent/engineering-guidance';
import { getModelStatus } from '../src/shared/model-status';
import type { Settings } from '../src/shared/types';

const settings: Settings = {
  provider: 'openai-compatible',
  model: 'docker.io/ai/smollm2:360M-Q4_K_M',
  endpoint: 'http://localhost:12434/engines/v1',
  awsRegion: 'us-east-1',
  hfToken: '',
  e2bKey: '',
  useE2B: false,
  maxCycles: 6
};

describe('engineering guidance', () => {
  it('applies queued user quality feedback to relevant agent tasks', () => {
    expect(formatQueuedFeedback('Check responsive behavior and broken images.'))
      .toContain('Check responsive behavior and broken images.');
    expect(formatQueuedFeedback('  ')).toBe('');
  });

  it('requires evidence and truthfully reports unavailable browser verification', () => {
    expect(ENGINEERING_GUIDANCE).toContain('actual exit codes');
    expect(ENGINEERING_GUIDANCE).toContain('do not claim it was verified');
  });
});

describe('model status', () => {
  it('does not require a Hugging Face token for a local provider', () => {
    expect(getModelStatus(settings, 'untested')).toEqual({
      configured: true,
      label: 'Model configured - test required'
    });
  });

  it('only reports a verified model after a successful inference test', () => {
    expect(getModelStatus(settings, 'connected').label).toBe('Model verified');
    expect(getModelStatus(settings, 'error').label).toBe('Model unavailable');
  });

  it('reports a missing local model configuration without hiding chat', () => {
    expect(getModelStatus({ ...settings, model: '' }, 'untested')).toEqual({
      configured: false,
      label: 'Model not configured'
    });
  });

  it('recognizes a saved Hugging Face token without exposing it to the renderer', () => {
    expect(getModelStatus({
      ...settings,
      provider: 'huggingface',
      endpoint: 'https://router.huggingface.co/v1',
      model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
      hfToken: '',
      hfTokenConfigured: true
    }, 'untested').configured).toBe(true);
  });
});
