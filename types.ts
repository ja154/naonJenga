/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface AnalysisResult {
  title: string;
  description: string;
  tags: string[];
  cinematicPrompt: string;
}

export interface ConsistencyResult {
  score: number; // A score from 0-100
  explanation: string; // A brief explanation for the score
}
