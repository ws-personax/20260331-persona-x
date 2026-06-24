import { SHARED_HOCHING_RULES } from './shared-hoching';
import {
  RAY_DNA,
  RAY_FEW_SHOTS,
  RAY_OUTPUT_STYLE,
  RAY_RULES,
  RAY_SAFETY,
} from '@/lib/personax/personas/ray';
export const TEA_SYSTEM_RAY = [
  SHARED_HOCHING_RULES,
  RAY_SAFETY,
  RAY_DNA,
  RAY_RULES,
  RAY_OUTPUT_STYLE,
  RAY_FEW_SHOTS,
].join('\n\n');

