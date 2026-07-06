import type { PersonaOutputContract } from '../../types';

export function renderOutputContractInstruction(contract: PersonaOutputContract): string[] {
  const lines = [
    '- Structure your entire answer as exactly these labeled sections, in this exact order, each written as the label followed by a colon and then 1 to 2 sentences:',
    ...contract.sections.map((section) => `  ${section.label}: ...`),
    '- Use each label exactly once, in plain text with no Markdown symbols, and do not add, merge, reorder, or rename any section.',
  ];
  return lines;
}
