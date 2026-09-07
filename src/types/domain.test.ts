import { describe, expect, it } from 'vitest';
import type { SubmissionOrigin, SourceArtifactOrigin, SourceArtifactType } from './domain.js';

// Type-level guard for the open-discriminator contract (Architecture §3, Decision 1.1/G-2).
// A regression that narrows these back to closed literal unions (e.g. dropping the
// `(string & {})` member) would fail this file's `tsc --noEmit` pass, not just at runtime —
// runtime acceptance of arbitrary strings is already covered by submitSources.test.ts.

// Strict type-identity check: distinguishes "correctly open" (`'human' | (string & {})`) from
// "incorrectly widened to plain `string`" — both accept an arbitrary string as a *value*, so an
// assignability check alone (e.g. `const x: T = 'arbitrary'`) cannot tell them apart. This uses
// the standard bidirectional-conditional-type identity trick: `A extends B ? 1 : 2` and
// `B extends A ? 1 : 2` only produce the same result for every input when A and B are the exact
// same type — `string` and `'human' | (string & {})` diverge on this check even though both are
// assignable from/to `string`.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

// If any of these were accidentally widened to plain `string`, the corresponding line fails to
// compile (`tsc --noEmit`) because `Equal<..., string>` resolves to `false`, not `true`.
type AssertNotWidenedToString<T extends true> = T;
type _SubmissionOriginNotString = AssertNotWidenedToString<
  Equal<Equal<SubmissionOrigin, string>, false>
>;
type _SourceArtifactTypeNotString = AssertNotWidenedToString<
  Equal<Equal<SourceArtifactType, string>, false>
>;
type _SourceArtifactOriginNotString = AssertNotWidenedToString<
  Equal<Equal<SourceArtifactOrigin, string>, false>
>;

describe('open discriminator types stay open at the type level', () => {
  it('SubmissionOrigin accepts an arbitrary future string as a value of the type', () => {
    const origin: SubmissionOrigin = 'future-collector-channel';
    expect(origin).toBe('future-collector-channel');
  });

  it('SourceArtifactType accepts an arbitrary future string as a value of the type', () => {
    const type: SourceArtifactType = 'screenshot';
    expect(type).toBe('screenshot');
  });

  it('SourceArtifactOrigin accepts an arbitrary future string as a value of the type', () => {
    const origin: SourceArtifactOrigin = 'future-origin';
    expect(origin).toBe('future-origin');
  });
});
