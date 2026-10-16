import { describe, expect, it } from 'vitest';
import { getContinuationGoal } from '../src/agent/continuation-goal';

describe('continuation goal selection', () => {
  it('keeps the original request when a short continue message was sent later', () => {
    const messages = [
      { role: 'user', content: 'Finish the React marketplace and run its build.' },
      { role: 'user', content: 'conitinue' },
    ];

    expect(getContinuationGoal(messages, 'nested continuation')).toBe(
      'Finish the React marketplace and run its build.',
    );
  });

  it('ignores repeated short continue nudges after a longer request', () => {
    const original = 'Transform my existing e-commerce website into a polished, responsive marketplace.';
    const messages = [
      { role: 'user', content: original },
      { role: 'assistant', content: 'Task blocked: invalid model plan.' },
      { role: 'user', content: 'continue improving the application' },
      { role: 'assistant', content: 'Task blocked: invalid model plan.' },
      { role: 'user', content: 'continue the ecommerce application' },
    ];

    expect(getContinuationGoal(messages, 'fallback')).toBe(original);
  });

  it('prefers the full original task over a later short improve-and-continue nudge', () => {
    const original = 'Transform the existing store into a fully functional online marketplace with responsive styling, working cart, search, checkout validation, and a production build.';
    const messages = [
      { role: 'user', content: original },
      { role: 'user', content: 'now do more then observe by yourself then tell and upgrade my web app okdo it' },
      { role: 'assistant', content: 'Task blocked: invalid model plan.' },
      { role: 'user', content: 'continue improving the application' },
    ];

    expect(getContinuationGoal(messages, 'fallback')).toBe(original);
  });

  it('uses the most recent substantive user request', () => {
    const messages = [
      { role: 'user', content: 'Build a marketplace.' },
      { role: 'user', content: 'Also add responsive styles and test the build.' },
      { role: 'user', content: 'continue' },
    ];

    expect(getContinuationGoal(messages, 'fallback')).toBe(
      'Also add responsive styles and test the build.',
    );
  });

  it('falls back to the saved task goal when no substantive user message exists', () => {
    expect(getContinuationGoal([{ role: 'user', content: 'continue' }], 'saved goal')).toBe(
      'saved goal',
    );
  });
});
