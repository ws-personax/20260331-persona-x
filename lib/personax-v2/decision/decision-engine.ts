// Runtime v2 decision engine keeps persona originals intact and adds only a
// short deterministic summary for the current question.
import type { ClassifierResult, DecisionResult, DecisionSummary, PersonaId, PersonaResult } from '../types';

interface DecisionEngineInput {
  userQuestion: string;
  classifierResult: ClassifierResult;
  personaResults: PersonaResult[];
}

type DecisionCategory = 'invest' | 'emotional' | 'action' | 'knowledge' | 'principle';

const PERSONA_ORDER: PersonaId[] = ['ray', 'jack', 'lucia', 'echo'];

export function runDecisionEngine(input: DecisionEngineInput): DecisionResult {
  return {
    personaResults: input.personaResults,
    decisionSummary: buildDecisionSummary(input),
  };
}

function buildDecisionSummary(input: DecisionEngineInput): DecisionSummary {
  const category = inferDecisionCategory(input.userQuestion, input.classifierResult);
  const confidence = inferConfidence(input.personaResults);

  switch (category) {
    case 'invest':
      return {
        conclusion: '지금은 단정적으로 실행할 문제가 아니라, 확인된 조건과 감당 가능한 손실 범위를 먼저 맞춰야 하는 상황입니다.',
        keyRisks: [
          '하루 데이터나 단기 변동만 보고 판단할 위험',
          '손실 기준 없이 움직여 감정적으로 대응할 위험',
        ],
        suggestedNextStep: '현재 가격보다 먼저 보유 기간, 손실 한도, 다시 확인할 조건 하나를 적어두세요.',
        confidence,
      };
    case 'emotional':
      return {
        conclusion: '지금 핵심은 감정을 없애는 것이 아니라, 감정이 판단을 대신하지 못하게 분리하는 것입니다.',
        keyRisks: [
          '불편한 감정을 바로 행동 명령으로 받아들일 위험',
          '상황보다 자기비난이나 회피가 먼저 커질 위험',
        ],
        suggestedNextStep: '오늘은 감정 이름 하나를 적고, 그 감정과 별개로 할 수 있는 아주 작은 행동 하나만 정하세요.',
        confidence,
      };
    case 'action':
      return {
        conclusion: '결정은 더 많은 생각보다 확인 가능한 다음 행동 하나로 좁혀야 합니다.',
        keyRisks: [
          '정보가 부족한 상태에서 크게 움직일 위험',
          '결정을 미루는 동안 선택지가 줄어들 위험',
        ],
        suggestedNextStep: '오늘 바로 확인하거나 실행할 수 있는 가장 작은 행동 하나를 정하고 끝내세요.',
        confidence,
      };
    case 'knowledge':
      return {
        conclusion: '이 질문은 먼저 핵심 개념을 정확히 이해하고, 그 개념이 실제 상황에 어떻게 연결되는지 구분해야 합니다.',
        keyRisks: [
          '개념 설명을 곧바로 행동 신호로 오해할 위험',
          '정의와 실제 적용 조건을 섞어서 판단할 위험',
        ],
        suggestedNextStep: '핵심 정의를 한 문장으로 정리한 뒤, 지금 내 상황에 적용되는 조건이 있는지만 따로 확인하세요.',
        confidence,
      };
    case 'principle':
      return {
        conclusion: '좋은 원칙은 추상적인 정답이 아니라, 실제 선택에서 반복해서 적용할 수 있는 기준이어야 합니다.',
        keyRisks: [
          '보편적인 정답을 찾다가 자기 상황을 놓칠 위험',
          '기준을 세우는 일로 실제 선택을 미룰 위험',
        ],
        suggestedNextStep: '지금 질문에 적용할 기준을 하나만 고르고, 그 기준으로 실제 선택지 하나를 점검하세요.',
        confidence,
      };
  }
}

function inferDecisionCategory(userQuestion: string, classifierResult: ClassifierResult): DecisionCategory {
  if (classifierResult.isInvest) return 'invest';

  if (/(감정|불안|힘들|싫|시기|외롭|우울|화가|상처|남편|관계)/.test(userQuestion)) {
    return 'emotional';
  }
  if (/(기준|원칙|좋은|배우자|성공|행복|자유|의미)/.test(userQuestion)) {
    return 'principle';
  }
  if (/(해야|할까요|먼저|창업|재취업|이직|결정|선택)/.test(userQuestion)) {
    return 'action';
  }
  return 'knowledge';
}

function inferConfidence(personaResults: PersonaResult[]): DecisionSummary['confidence'] {
  const liveCount = personaResults.filter((result) => result.mode === 'live').length;
  if (liveCount >= PERSONA_ORDER.length) return 'high';
  if (liveCount >= 2) return 'medium';
  return 'low';
}
