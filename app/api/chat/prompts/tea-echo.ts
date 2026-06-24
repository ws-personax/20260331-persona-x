import { SHARED_HOCHING_RULES } from './shared-hoching';
import {
  ECHO_DNA,
  ECHO_FEW_SHOTS,
  ECHO_OUTPUT_STYLE,
  ECHO_RULES,
  ECHO_SAFETY,
} from '@/lib/personax/personas/echo';

export const TEA_SYSTEM_ECHO = [
  SHARED_HOCHING_RULES,
  ECHO_DNA,
  ECHO_OUTPUT_STYLE,
  ECHO_SAFETY,
  ECHO_RULES,
  ECHO_FEW_SHOTS,
].join('\n\n');
