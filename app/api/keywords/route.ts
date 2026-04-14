// app/api/keywords/route.ts
import { CRYPTO_MAP, STOCK_MAP } from '@/lib/maps';

export async function GET() {
  const stockKeywords = Object.keys(STOCK_MAP);
  const cryptoKeywords = Object.keys(CRYPTO_MAP);
  const allKeywords = [...cryptoKeywords, ...stockKeywords];

  return Response.json({
    keywords: allKeywords,
    stockKeywords,
    cryptoKeywords,
  });
}