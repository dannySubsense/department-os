import { describe, expect, it } from 'vitest';
import {
  recordToolInvocation,
  withProvenanceCollector,
  type CapturedToolInvocation,
} from './provenanceContext.js';

/** Architecture §1.9 point 1 — the AsyncLocalStorage-scoped collector must be a genuine no-op when
 *  no scope is open (this is what makes it safe to call unconditionally from every existing
 *  callForcedTool/searchWeb call path), and must correctly route/scope invocations when a
 *  withProvenanceCollector scope IS open, including under concurrency (AsyncLocalStorage's core
 *  guarantee — no leakage between concurrent scopes). */

function invocation(toolName: string): CapturedToolInvocation {
  return {
    toolName,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

describe('recordToolInvocation — no-op with no open scope', () => {
  it('does not throw and has no observable effect when called with no collector scope open', () => {
    expect(() => recordToolInvocation(invocation('unscoped_tool'))).not.toThrow();
  });

  it('does not throw even when called many times in a row with no scope open', () => {
    expect(() => {
      for (let i = 0; i < 5; i++) recordToolInvocation(invocation(`unscoped_tool_${i}`));
    }).not.toThrow();
  });
});

describe('withProvenanceCollector — captures invocations within an open scope', () => {
  it('routes recordToolInvocation calls made inside fn to the scope collector', async () => {
    const captured: CapturedToolInvocation[] = [];
    const collector = { record: (inv: CapturedToolInvocation) => captured.push(inv) };

    await withProvenanceCollector(collector, async () => {
      recordToolInvocation(invocation('tool_a'));
      recordToolInvocation(invocation('tool_b'));
    });

    expect(captured).toHaveLength(2);
    expect(captured.map((c) => c.toolName)).toEqual(['tool_a', 'tool_b']);
  });

  it('routes invocations recorded several async call frames deep within the scope (the whole point of AsyncLocalStorage over a passed parameter)', async () => {
    const captured: CapturedToolInvocation[] = [];
    const collector = { record: (inv: CapturedToolInvocation) => captured.push(inv) };

    async function deepCall() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      recordToolInvocation(invocation('deep_tool'));
    }

    await withProvenanceCollector(collector, async () => {
      await deepCall();
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].toolName).toBe('deep_tool');
  });

  it('returns fn result and stops routing to the collector once the scope has closed', async () => {
    const captured: CapturedToolInvocation[] = [];
    const collector = { record: (inv: CapturedToolInvocation) => captured.push(inv) };

    const result = await withProvenanceCollector(collector, async () => {
      recordToolInvocation(invocation('inside_scope'));
      return 'done';
    });

    expect(result).toBe('done');
    // After the scope has closed, recording is a no-op again — must not throw, and must not
    // append to the now-closed collector's array.
    expect(() => recordToolInvocation(invocation('after_scope'))).not.toThrow();
    expect(captured).toEqual([{ toolName: 'inside_scope', startedAt: expect.any(String), completedAt: expect.any(String) }]);
  });

  it('isolates two concurrent withProvenanceCollector scopes — no cross-scope leakage (AsyncLocalStorage core guarantee)', async () => {
    const capturedA: CapturedToolInvocation[] = [];
    const capturedB: CapturedToolInvocation[] = [];
    const collectorA = { record: (inv: CapturedToolInvocation) => capturedA.push(inv) };
    const collectorB = { record: (inv: CapturedToolInvocation) => capturedB.push(inv) };

    async function scopedWork(toolPrefix: string, delays: number[]) {
      for (const delay of delays) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        recordToolInvocation(invocation(`${toolPrefix}_${delay}`));
      }
    }

    await Promise.all([
      withProvenanceCollector(collectorA, () => scopedWork('a', [5, 15, 1])),
      withProvenanceCollector(collectorB, () => scopedWork('b', [10, 2, 20])),
    ]);

    expect(capturedA.every((inv) => inv.toolName.startsWith('a_'))).toBe(true);
    expect(capturedB.every((inv) => inv.toolName.startsWith('b_'))).toBe(true);
    expect(capturedA).toHaveLength(3);
    expect(capturedB).toHaveLength(3);
  });
});
