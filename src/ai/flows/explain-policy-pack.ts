'use server';

/**
 * @fileOverview This file defines a Genkit flow for explaining policy packs in the Airlock Console.
 *
 * It exports:
 * - `explainPolicyPack`: An async function that takes a policy pack description and returns a GenAI-powered explanation.
 * - `ExplainPolicyPackInput`: The input type for the `explainPolicyPack` function.
 * - `ExplainPolicyPackOutput`: The output type for the `explainPolicyPack` function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExplainPolicyPackInputSchema = z.object({
  policyPackDescription: z
    .string()
    .describe('The description of the policy pack to be explained.'),
});
export type ExplainPolicyPackInput = z.infer<typeof ExplainPolicyPackInputSchema>;

const ExplainPolicyPackOutputSchema = z.object({
  explanation: z
    .string()
    .describe('A GenAI-powered explanation of the policy pack.'),
});
export type ExplainPolicyPackOutput = z.infer<typeof ExplainPolicyPackOutputSchema>;

export async function explainPolicyPack(input: ExplainPolicyPackInput): Promise<ExplainPolicyPackOutput> {
  return explainPolicyPackFlow(input);
}

const explainPolicyPackPrompt = ai.definePrompt({
  name: 'explainPolicyPackPrompt',
  input: {schema: ExplainPolicyPackInputSchema},
  output: {schema: ExplainPolicyPackOutputSchema},
  prompt: `You are an expert in data loss prevention (DLP) policies.  A user has provided the following description of a policy pack: {{{policyPackDescription}}}.  Your task is to provide a concise explanation of the policy pack, suitable for an administrator who needs to quickly understand its purpose and the types of data it protects against.`,
});

const explainPolicyPackFlow = ai.defineFlow(
  {
    name: 'explainPolicyPackFlow',
    inputSchema: ExplainPolicyPackInputSchema,
    outputSchema: ExplainPolicyPackOutputSchema,
  },
  async input => {
    const {output} = await explainPolicyPackPrompt(input);
    return output!;
  }
);
