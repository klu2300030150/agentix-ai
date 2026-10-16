import { describe, expect, it } from 'vitest';
import { RepeatedPlanGuard } from '../src/agent/progress-guard';

describe('repeated action plan guard', () => {
  it('stops a consecutive duplicate plan', () => {
    const guard = new RepeatedPlanGuard();
    const actions = [{ tool: 'read_file', path: 'src/App.tsx' }];

    expect(guard.isRepeated(actions)).toBe(false);
    expect(guard.isRepeated(actions)).toBe(true);
  });

  it('recognizes the same action when JSON property order changes', () => {
    const guard = new RepeatedPlanGuard();

    expect(guard.isRepeated([{ tool: 'read_file', path: 'src/App.tsx' }])).toBe(false);
    expect(guard.isRepeated([{ path: 'src/App.tsx', tool: 'read_file' }])).toBe(true);
  });

  it('allows a changed plan and only stops if that plan repeats', () => {
    const guard = new RepeatedPlanGuard();

    expect(guard.isRepeated([{ tool: 'list_files' }])).toBe(false);
    expect(guard.isRepeated([{ tool: 'read_file', path: 'src/App.tsx' }])).toBe(false);
    expect(guard.isRepeated([{ tool: 'read_file', path: 'src/App.tsx' }])).toBe(true);
  });

  it('does not mistake an empty plan for a repeated action', () => {
    const guard = new RepeatedPlanGuard();

    expect(guard.isRepeated([])).toBe(false);
    expect(guard.isRepeated([])).toBe(false);
  });
});
