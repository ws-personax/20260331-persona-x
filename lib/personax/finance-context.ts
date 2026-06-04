export const detectTargetedPersona = (echoResp: string): 'RAY' | 'JACK' | 'LUCIA' | null => {
  if (!echoResp) return null;
  const lastQ = echoResp.lastIndexOf('?');
  const tail = lastQ > 0
    ? echoResp.slice(Math.max(0, lastQ - 200), lastQ + 1)
    : echoResp.slice(-200);
  const m = tail.match(/(RAY|JACK|LUCIA)/i);
  return m ? (m[1].toUpperCase() as 'RAY' | 'JACK' | 'LUCIA') : null;
};
