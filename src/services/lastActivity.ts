/** Shared `lastActivityAt` SQL fragment — Architecture §4 (Checkpoint-1-restricted `GREATEST`
 *  query). This is the ONE shared query text, imported by both `getMissionControlView.ts` and
 *  `getProblemDepartmentOverview.ts` — never re-derived independently (US-4 AC3, Constraint
 *  "one shared query, not two divergent recency definitions"). Drops
 *  `generation_component_event.occurred_at` (Checkpoint-3 table, does not exist this checkpoint)
 *  from `DESIGN-PROPOSAL.md` §4a's formula — everything else is real and present today
 *  (migrations 001, 006, 007). */
export const LAST_ACTIVITY_SUBQUERY = `
  SELECT i.id AS investigation_id,
         GREATEST(
           i.created_at,
           COALESCE(MAX(gr.started_at), i.created_at),
           COALESCE(MAX(gr.completed_at), i.created_at),
           COALESCE(MAX(gs.completed_at), i.created_at),
           COALESCE(MAX(bv.created_at), i.created_at)
         ) AS last_activity_at
    FROM investigation i
    LEFT JOIN generation_run gr ON gr.investigation_id = i.id
    LEFT JOIN generation_step gs ON gs.generation_run_id = gr.id
    LEFT JOIN problem_brief pb ON pb.investigation_id = i.id
    LEFT JOIN brief_version bv ON bv.problem_brief_id = pb.id
   GROUP BY i.id, i.created_at
`;
