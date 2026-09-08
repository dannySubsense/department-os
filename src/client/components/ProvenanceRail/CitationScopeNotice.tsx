/** Fixed disclosure, always visible — never conditional on the displayed Brief version's own
 *  content. Restates `problem-department-mvp/02-ARCHITECTURE.md`'s "Accepted MVP limitation"
 *  (citation presence, not citation correctness): a populated citation array guarantees every
 *  required element traces to real, non-empty evidence — it does not verify that the cited
 *  evidence actually supports the claim, gap, or classification it is attached to. Guards against
 *  a reviewer mistaking a populated citation list for independent verification. */
export function CitationScopeNotice() {
  return (
    <section className="provenance-rail__citation-scope-notice" aria-label="Citation scope">
      <h4>Citation Scope</h4>
      <p>
        Every required element in this Brief cites at least one piece of real, retained evidence.
        This guarantees citation presence — it does not verify that the cited evidence actually
        supports the claim, gap, or classification it is attached to. Read each citation's excerpt
        and stance directly rather than treating its presence alone as independent verification.
      </p>
    </section>
  );
}
