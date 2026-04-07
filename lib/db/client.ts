import { createClient } from '@supabase/supabase-js'

// .env.local?ì„œ ?¤ì •??ì£¼ì†Œ?€ ë¹„ë? ?¤ë? ê°€?¸ì˜µ?ˆë‹¤.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// ??'supabase'ê°€ ?ìœ¼ë¡?DB??ê¸€???¨ì¤„ ?°ë¦¬ ì§??¼ê¾¼?…ë‹ˆ??
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
