# Suggestion lookup allocation

Lookup validates and detaches provider rows on refresh, then fuzzy-matches the
entire ordinary list. Per-request candidates retain that validated item, its
provider and its effective match. Creation calls remain interleaved with ordinary
provider calls, but all ordinary candidates enter deduplication before creation
candidates, after every provider call has finished.

Semantic keys and the full stable score sort are unchanged. A better duplicate
replaces the winner without moving the key's first encounter position; equal
scores retain the earlier winner. Files retain live object identity, and actions
retain configured-provider identity. Creation matches are not fuzzy-filtered.

After sorting, lookup reads the inherited `EditorSuggest.limit` once. A positive
safe integer limits returned rows; every other value returns the full sorted list
for the host to apply its existing coercion. Only returned winners receive fresh
row/target wrappers and private provider/context provenance. Dismissal bookkeeping
retains the total unique count. No provider list or fuzzy scan is truncated, and
cached rows are never modified.

This bounds final materialization by the visible prefix, while retaining O(M)
candidate storage for M matches and the existing full sort of U unique winners.
It does not reduce native fuzzy-search work, provider evaluation, or integration
index costs. Uncapped lookups still materialize every unique winner.

`tests/SuggestionTargets.test.ts` compares against the accepted eager full-output
algorithm followed by native host slicing, using explicit adversarial rows and a
fixed-seed mixed-target fixture. It also checks capped provenance, file identity,
fresh wrappers, cache reuse and asynchronous selection continuity. Existing
trigger, freshness and action tests remain part of verification.

Performance acceptance uses paired fresh processes for accepted base and
candidate, pinned Node/npm and the same native fuzzy implementation and inputs:
1k/10k/50k files, one/two Folder or Dataview sources, cold/warm/narrow/broaden/expiry
queries, and limits 100 and uncapped. Timing is a review gate, never a CI assertion.
Raw local receipts record source/native hashes, sample times, counts and cache
calls. Private native extracts stay outside Git. Synthetic retrieval measurements
exclude rendering, native typing, mobile behavior and the actual Dataview query
engine; these remain separate runtime acceptance requirements.
