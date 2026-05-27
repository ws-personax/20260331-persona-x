export type DebatePersona = 'ray' | 'jack' | 'lucia';

export type DebatePlan = {
  order: DebatePersona[];
  ray_angle: string;
  jack_angle: string;
  lucia_angle: string;
  echo_target: DebatePersona;
  echo_angle: string;
  conflict_point: string;
  ray_limit: string;
  lucia_limit: string;
  is_followup: boolean;
  avoid_repeat: string;
};

export type DebatePlanPriorContext = {
  recentSummary?: string;
  priorRayResponse?: string;
};

const DEBATE_PERSONAS: readonly DebatePersona[] = ['ray', 'jack', 'lucia'];

const isDebatePersona = (value: unknown): value is DebatePersona =>
  typeof value === 'string' && (DEBATE_PERSONAS as readonly string[]).includes(value);

export const createFallbackDebatePlan = (
  fallbackOrder: DebatePersona[] = ['ray', 'jack', 'lucia'],
  priorContext: DebatePlanPriorContext = {},
): DebatePlan => {
  const hasPrior = !!(priorContext.recentSummary || priorContext.priorRayResponse);
  return {
    order: fallbackOrder,
    ray_angle: '',
    jack_angle: '',
    lucia_angle: '',
    echo_target: 'jack',
    echo_angle: '',
    conflict_point: '',
    ray_limit: '숫자 2개만. 핵심 지표명 명시.',
    lucia_limit: '3줄 이내. 마침표 종결.',
    is_followup: hasPrior,
    avoid_repeat: priorContext.priorRayResponse ? priorContext.priorRayResponse.slice(0, 120) : '',
  };
};

export const parseDebatePlanJson = (
  raw: string,
  fallback: DebatePlan,
): DebatePlan => {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return fallback;
  try {
    const parsed = JSON.parse(m[0]) as Record<string, unknown>;
    const orderArr = Array.isArray(parsed.order) ? parsed.order.filter(isDebatePersona) : [];
    return {
      order: orderArr.length === 3 ? orderArr : fallback.order,
      ray_angle: typeof parsed.ray_angle === 'string' ? parsed.ray_angle : '',
      jack_angle: typeof parsed.jack_angle === 'string' ? parsed.jack_angle : '',
      lucia_angle: typeof parsed.lucia_angle === 'string' ? parsed.lucia_angle : '',
      echo_target: isDebatePersona(parsed.echo_target) ? parsed.echo_target : fallback.echo_target,
      echo_angle: typeof parsed.echo_angle === 'string' ? parsed.echo_angle : '',
      conflict_point: typeof parsed.conflict_point === 'string' ? parsed.conflict_point : '',
      ray_limit: typeof parsed.ray_limit === 'string' && parsed.ray_limit.trim() ? parsed.ray_limit : fallback.ray_limit,
      lucia_limit: typeof parsed.lucia_limit === 'string' && parsed.lucia_limit.trim() ? parsed.lucia_limit : fallback.lucia_limit,
      is_followup: typeof parsed.is_followup === 'boolean' ? parsed.is_followup : fallback.is_followup,
      avoid_repeat: typeof parsed.avoid_repeat === 'string' ? parsed.avoid_repeat : fallback.avoid_repeat,
    };
  } catch {
    return fallback;
  }
};
