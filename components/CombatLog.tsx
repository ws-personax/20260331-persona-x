// ?¨ ì§€?˜ê??˜ì˜ ?„ìˆ ???¤í???ê°€?´ë“œ
const getCardStyle = (role: string) => {
    // 1. ë§ˆìš°???¸ë²„ ???´ì§ ì»¤ì?ê³?ê·¸ë¦¼?ê? ê¹Šì–´ì§€???¨ê³¼ (scale-[1.01])
    const base = `p-5 rounded-xl transition-all duration-200 cursor-default
                  hover:scale-[1.01] hover:shadow-lg shadow-sm 
                  animate-in slide-in-from-bottom-4 `;
    
    // 2. ?ì½”??ë°œì–¸?€ ???ê»ê²?6px), ì°¸ëª¨?¤ì? ê¸°ë³¸(4px)?¼ë¡œ ?¤ì •?˜ì—¬ ê¶Œìœ„ ì°¨ë³„??
    const borderWidth = role === 'Echo' ? 'border-l-[6px]' : 'border-l-4';
  
    if (role === 'Echo') 
      return base + borderWidth + ' bg-amber-50 border-amber-500 text-amber-900 font-bold shadow-md ring-1 ring-amber-200';
      
    if (role === 'Jack') 
      return base + borderWidth + ' bg-gradient-to-r from-red-50 to-red-100 border-red-500 shadow-red-200 text-red-900';
      
    if (role === 'Leo') 
      return base + borderWidth + ' bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-500 shadow-emerald-200 text-emerald-900';
      
    return base + borderWidth + ' bg-gradient-to-r from-blue-50 to-blue-100 border-blue-500 shadow-blue-200 text-blue-900';
  };
