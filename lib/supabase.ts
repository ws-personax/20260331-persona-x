import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ?œë””???°ë¦¬ ?„ë¡œ?íŠ¸?€ Supabase ì°½ê³ ê°€ ?°ê²°?˜ëŠ” ?œê°„?…ë‹ˆ??
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
