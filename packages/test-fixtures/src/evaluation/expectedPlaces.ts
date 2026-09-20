export function evaluationCandidateIds(scenarioId: string, durationDays: number): string[] {
  return Array.from({ length: durationDays * 3 }, (_, index) => `fixture:${scenarioId.toLowerCase()}-place-${index + 1}`);
}
