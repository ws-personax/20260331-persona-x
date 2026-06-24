import { SHARED_HOCHING_RULES } from './shared-hoching';
import {
  JACK_DNA,
  JACK_FEW_SHOTS,
  JACK_OUTPUT_STYLE,
  JACK_RULES,
  JACK_SAFETY,
} from '@/lib/personax/personas/jack';
export const TEA_SYSTEM_JACK = [
  SHARED_HOCHING_RULES,
  JACK_SAFETY,
  JACK_DNA,
  JACK_RULES,
  JACK_OUTPUT_STYLE,
  JACK_FEW_SHOTS,
].join('\n\n');

