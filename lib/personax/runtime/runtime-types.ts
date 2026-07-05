/**
 * Runtime v1 shared contract.
 *
 * This file defines the stable type boundary for future Runtime layers.
 * It intentionally does not import existing runtime modules, change current
 * execution flow, or introduce implementation helpers. Runtime v1 is a
 * persona-id-based pipeline; display position belongs only to Speaker output.
 *
 * Runtime v1 layers:
 * - Classifier
 * - Research
 * - Persona
 * - Decision
 * - Speaker
 *
 * Debate is intentionally excluded from Runtime v1. Debate contracts belong to
 * a later v1.5 layer after the core Runtime boundary is stable.
 */

/**
 * Canonical persona identifiers used by Runtime v1.
 *
 * These ids are static for the first Runtime contract. A future Persona
 * Registry may make this set dynamic, but all Runtime layers should still
 * exchange persona identity through this common id shape.
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
 * Debate is not a Runtime v1 layer.
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
 * personas should participate in this request. It does not provide facts,
 * conclusions, order, or display slots.
 */
export interface ClassifierOutput {
  category: string;
  questionType: string;
  participants: PersonaId[];
}

/**
 * Research output is fact-only by design.
 *
 * Research may collect facts, market facts, contextual notes, and references.
 * It must never express verdict, decision, recommendation, stance, or opinion.
 * Those concepts belong to Persona and Decision layers, not Research.
 */
export interface ResearchBrief {
  facts: string[];
  marketFacts: string[];
  context: string[];
  references: string[];
}

/**
 * Persona input stays isolated.
 *
 * Each persona receives only the user question and the shared fact brief.
 * Runtime v1 does not pass previousPersonaResponses, previousContext,
 * dialogHistory, quoteContext, or other persona utterances into Persona input.
 * This prevents persona bleeding at the contract level.
 */
export interface PersonaInput {
  personaId: PersonaId;
  userQuestion: string;
  research: ResearchBrief;
}

/**
 * Persona layer output.
 *
 * This is one persona's independent opinion built from the shared fact set.
 * References are optional because not every persona response needs to cite
 * external material, but cited facts should point back to Research references
 * when available.
 */
export interface PersonaOpinion {
  personaId: PersonaId;
  summary: string;
  reasoning: string;
  confidence: number;
  references?: string[];
}

/**
 * Persona outputs are keyed by canonical persona id.
 *
 * This type intentionally has no first, second, third, closer, position, slot,
 * or display-order concept. Runtime reasoning is persona-id based; presentation
 * order is introduced only by the Speaker layer.
 */
export type PersonaOutputMap = Record<PersonaId, PersonaOpinion>;

/**
 * Decision layer output is the first place where Runtime may converge on a
 * final answer. Earlier layers prepare evidence and viewpoints only.
 */
export interface DecisionResult {
  summary: string;
  nextAction: string;
  reasons: string[];
  confidence?: number;
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
