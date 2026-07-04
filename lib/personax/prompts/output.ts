// PR4-A Runtime Skeleton — output.ts now only re-exports role-specific prompt modules.
// Prompt text, slot assembly logic, guardrails, and parsers are preserved in the split files.
export {
  buildTaggedRound1SystemPrompt,
  buildTaggedRound2SystemPrompt,
  buildTaggedRound1UserPrompt,
  buildTaggedRound2UserPrompt,
} from './output-tagged';
export {
  buildDataCollectionPrompt,
  buildPersonaAnalysisPrompt,
  buildScriptPrompt,
} from './output-stage';
export {
  parseTaggedRound1,
  parseTaggedRound2,
} from './output-parser';
export type {
  TaggedRound1Result,
  TaggedRound2Result,
} from './output-parser';
