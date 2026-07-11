export interface AiProvider {
  /**
   * Semantically maps raw CSV rows into structured JSON objects.
   * @param batch Array of raw CSV objects.
   * @param systemPrompt Instructions detailing schemas and mapping strategies.
   * @returns Array of mapped, flat objects.
   */
  extract(batch: any[], systemPrompt: string): Promise<any[]>;
}
