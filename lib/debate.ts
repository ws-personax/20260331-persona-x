import { GoogleGenerativeAI } from "@google/generative-ai";

// 중앙 금고에서 키와 모델명을 가져옵니다.
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");
const modelName = process.env.NEXT_PUBLIC_AI_MODEL || '2.0-flash-lite';

export const getDebateResponse = async (prompt: string) => {
  try {
    // [중앙 통제] 모델명을 변수로 처리하여 일괄 변경 가능하게 함
    const model = genAI.getGenerativeModel({ model: modelName });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Debate Logic 에러:", error);
    return "전략 토론 중 통신 장애가 발생했습니다.";
  }
};