import { SHARED_HOCHING_RULES } from './shared-hoching';
import {
  LUCIA_DNA,
  LUCIA_FEW_SHOTS,
  LUCIA_OUTPUT_STYLE,
  LUCIA_RULES,
  LUCIA_SAFETY,
} from '@/lib/personax/personas/lucia';
export const TEA_SYSTEM_LUCIA = [
  SHARED_HOCHING_RULES,
  LUCIA_SAFETY,
  LUCIA_DNA,
  LUCIA_RULES,
  LUCIA_OUTPUT_STYLE,
  LUCIA_FEW_SHOTS,
].join('\n\n');

