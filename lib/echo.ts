import { GoogleGenerativeAI } from "@google/generative-ai";

// 중앙 금고 설정 로드
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");
const modelName = process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-2.5-flash-lite';

export const getEchoResponse = async (input: string) => {
  try {
    // [중앙 통제] 일관된 모델 사용
    const model = genAI.getGenerativeModel({ model: modelName });

    const systemInstruction = "너는 지휘관의 명령을 복기하고 최적의 처방을 제안하는 조력자이다.";
    const result = await model.generateContent(`${systemInstruction}\n\n명령 내용: ${input}`);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Echo Logic 에러:", error);
    return "정보 반향 시스템 가동 실패.";
  }
};