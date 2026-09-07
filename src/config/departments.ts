import type { DepartmentSummary } from '../types/readModels.js';

export const DEPARTMENTS: ReadonlyArray<DepartmentSummary> = [
  {
    id: 'problem-department',
    name: 'Problem Department',
    thesis: 'What do people genuinely need, and where is the unresolved demand?',
    status: 'installed',
  },
  {
    id: 'signal-foundry',
    name: 'Signal Foundry',
    thesis: 'What is emerging that deserves attention?',
    status: 'planned',
  },
  {
    id: 'prototype-department',
    name: 'Prototype Department',
    thesis: 'What is the smallest credible thing we can build to test this opportunity?',
    status: 'planned',
  },
  {
    id: 'creative-practice-engine',
    name: 'Creative Practice Engine',
    thesis: 'How does this collection of projects become a coherent creative practice?',
    status: 'planned',
  },
] as const;
