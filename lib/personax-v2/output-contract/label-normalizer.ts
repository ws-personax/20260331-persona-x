import type { PersonaResult } from '../types';

export interface LabelCorrection {
  from: string;
  to: string;
  line: number;
}

export interface LabelNormalizationReport {
  changed: boolean;
  appliedCorrections: LabelCorrection[];
  unresolvedWarnings: string[];
  skippedCandidates: string[];
}

export interface LabelNormalizationResult {
  normalizedText: string;
  report: LabelNormalizationReport;
}

const OFFICIAL_LABELS = [
  '확인된 사실',
  '불확실한 점',
  '추가로 필요한 정보',
  '선택의 대가',
  '가장 큰 리스크',
  '실행 기준',
  '감정 인식',
  '감정과 판단 분리',
  '심리적 함정',
  '반복 패턴',
  '왜 반복되는가',
  '끊는 방법',
] as const;

const KNOWN_TYPO_LABELS: Record<string, string> = {
  '선택의 대사': '선택의 대가',
  '감정과 판断 분리': '감정과 판단 분리',
};

const OFFICIAL_LABEL_SET = new Set<string>(OFFICIAL_LABELS);

export function normalizePersonaResultLabels(results: PersonaResult[]): PersonaResult[] {
  return results.map((result) => {
    const normalization = normalizeOutputContractLabels(result.text);
    return {
      ...result,
      rawText: result.rawText ?? result.text,
      text: normalization.normalizedText,
      labelNormalization: normalization.report,
    };
  });
}

export function normalizeOutputContractLabels(text: string): LabelNormalizationResult {
  const appliedCorrections: LabelCorrection[] = [];
  const unresolvedWarnings: string[] = [];
  const skippedCandidates: string[] = [];

  const lines = text.split(/\r?\n/);
  const normalizedLines = lines.map((line, index) => {
    const match = line.match(/^(\s*)([^:：\n]{1,30})([:：])(.*)$/);
    if (!match) return line;

    const [, indent, candidate, separator, rest] = match;
    const trimmedCandidate = candidate.trim();
    if (OFFICIAL_LABEL_SET.has(trimmedCandidate)) return line;

    const replacement = resolveLabelReplacement(trimmedCandidate, skippedCandidates);
    if (!replacement) {
      if (looksLikeLabelCandidate(trimmedCandidate)) {
        unresolvedWarnings.push(`line ${index + 1}: ${trimmedCandidate}`);
      }
      return line;
    }

    appliedCorrections.push({
      from: trimmedCandidate,
      to: replacement,
      line: index + 1,
    });
    return `${indent}${replacement}${separator}${rest}`;
  });

  return {
    normalizedText: normalizedLines.join('\n'),
    report: {
      changed: appliedCorrections.length > 0,
      appliedCorrections,
      unresolvedWarnings,
      skippedCandidates,
    },
  };
}

export function runLabelNormalizerMockCases(): LabelNormalizationResult[] {
  return [
    normalizeOutputContractLabels('선택의 대사: 라벨 뒤 본문은 그대로 둡니다.'),
    normalizeOutputContractLabels('감정과 판断 분리: 라벨 뒤 본문은 그대로 둡니다.'),
  ];
}

function resolveLabelReplacement(candidate: string, skippedCandidates: string[]): string | null {
  const knownTypo = KNOWN_TYPO_LABELS[candidate];
  if (knownTypo) return knownTypo;

  const matches = OFFICIAL_LABELS
    .map((label) => ({ label, distance: levenshteinDistance(candidate, label) }))
    .filter(({ distance }) => distance > 0 && distance <= 2)
    .sort((a, b) => a.distance - b.distance);

  if (matches.length === 0) return null;
  if (matches.length > 1 && matches[0].distance === matches[1].distance) {
    skippedCandidates.push(candidate);
    return null;
  }
  return matches[0].label;
}

function looksLikeLabelCandidate(candidate: string): boolean {
  return OFFICIAL_LABELS.some((label) => label.includes(candidate) || candidate.includes(label.slice(0, 2)));
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column;

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return matrix[left.length][right.length];
}
