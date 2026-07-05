/**
 * Runtime v1 shared contract.
 *
 * This file defines only the stable type boundary for the Runtime pipeline.
 * It intentionally does not import existing runtime modules, change current
 * execution flow, or introduce implementation helpers.
 *
 * Runtime v1 layers:
 * - Classifier
 * - Research
 * - Persona
 * - Decision
 * - Speaker
 */

/**
 * Canonical persona identifiers used by Runtime v1.
 *
 * Keep this union aligned with the active registry for now. When a dedicated
 * registry is introduced later, this contract can expand without changing the
 * meaning of downstream Runtime layer payloads.
 */
export type PersonaId =
  | 'ray'
  | 'jack'
  | 'lucia'
  | 'echo';

/**
 * Named Runtime v1 layers.
 *
 * The contract uses explicit layer names so logs, tracing, and orchestration
 * can share one vocabulary before implementations are rewired to this shape.
 */
export type RuntimeLayer =
  | 'Classifier'
  | 'Research'
  | 'Persona'
  | 'Decision'
  | 'Speaker';

/**
 * Classifier output defines routing metadata only.
 *
 * The classifier decides how the question should be interpreted and which
 * personas should participate, but it does not provide facts or conclusions.
 */
export interface ClassifierOutput {
  category: string;
  questionType: string;
  participants: PersonaId[];
}

/**
 * Research output is fact-only by design.
 *
 * This contract deliberately avoids verdict, recommendation, opinion, and
 * decision-like fields so the Decision layer remains the only place where a
 * final conclusion is synthesized.
 */
export interface ResearchBrief {
  userQuestionFacts: string[];
  marketFacts: string[];
  contextFacts: string[];
  sourceNotes: string[];
}

/**
 * Persona input stays isolated.
 *
 * Each persona receives only the user question and the shared fact brief.
 * Other persona outputs are intentionally excluded so Runtime v1 preserves
 * independent first-pass reasoning at the Persona layer.
 */
export interface PersonaInput {
  personaId: PersonaId;
  userQuestion: string;
  researchBrief: ResearchBrief;
}

/**
 * Persona layer output.
 *
 * This is an opinionated interpretation built from the shared fact set.
 * Confidence is a normalized numeric signal intended for later aggregation.
 */
export interface PersonaOpinion {
  personaId: PersonaId;
  summary: string;
  reasoning: string;
  confidence: number;
}

/**
 * Persona outputs are keyed by canonical persona id.
 *
 * The map shape keeps Runtime contracts stable even if caller-side filtering
 * or selective participation rules evolve in later implementation PRs.
 */
export type PersonaOutputMap = Record<PersonaId, PersonaOpinion>;

/**
 * Decision layer output is the first place where Runtime may converge on a
 * final answer. Earlier layers prepare evidence and viewpoints only.
 */
export interface DecisionResult {
  finalConclusion: string;
  nextAction: string;
  supportingReasons: string[];
}

/**
 * Speaker Router output is presentation-oriented.
 *
 * `displayOrder` is allowed only here because ordering for UI presentation is
 * a rendering concern. Position concepts do not belong to internal Runtime
 * reasoning contracts such as Persona or Decision outputs.
 */
export interface SpeakerPayload {
  displayOrder: PersonaId[];
  leadSummary: string;
  messages: Array<{
    personaId: PersonaId;
    content: string;
  }>;
}

/**
 * Final Runtime v1 envelope.
 *
 * This top-level result keeps each layer's contract explicit so future
 * refactors can migrate implementation details behind a stable shared shape.
 */
export interface RuntimeResult {
  classifier: ClassifierOutput;
  research: ResearchBrief;
  personaOutputs: PersonaOutputMap;
  decision: DecisionResult;
  speaker: SpeakerPayload;
}
