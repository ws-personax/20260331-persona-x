import type { PersonaPromptInput, PersonaResult } from '../types';
import { generatePersonaText } from './shared/llm';
import { buildEchoDefinition } from './echo/identity';
import { buildJackDefinition } from './jack/identity';
import { buildLuciaDefinition } from './lucia/identity';
import { buildRayDefinition } from './ray/identity';

export async function runPersonaEngine(input: PersonaPromptInput): Promise<PersonaResult[]> {
  const definitions = [
    buildRayDefinition(),
    buildJackDefinition(),
    buildLuciaDefinition(),
    buildEchoDefinition(),
  ];

  return Promise.all(definitions.map((definition) => generatePersonaText(definition, input)));
}
