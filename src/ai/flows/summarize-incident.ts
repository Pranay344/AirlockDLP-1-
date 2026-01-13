'use server';

/**
 * @fileOverview A flow for summarizing incident details using GenAI.
 *
 * - summarizeIncident - A function that takes incident details as input and returns a summary.
 * - SummarizeIncidentInput - The input type for the summarizeIncident function.
 * - SummarizeIncidentOutput - The return type for the summarizeIncident function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeIncidentInputSchema = z.object({
  incidentDetails: z.string().describe('Details of the incident to be summarized.'),
});

export type SummarizeIncidentInput = z.infer<typeof SummarizeIncidentInputSchema>;

const SummarizeIncidentOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the incident, highlighting key details and potential risks.'),
});

export type SummarizeIncidentOutput = z.infer<typeof SummarizeIncidentOutputSchema>;

export async function summarizeIncident(input: SummarizeIncidentInput): Promise<SummarizeIncidentOutput> {
  return summarizeIncidentFlow(input);
}

const summarizeIncidentPrompt = ai.definePrompt({
  name: 'summarizeIncidentPrompt',
  input: {schema: SummarizeIncidentInputSchema},
  output: {schema: SummarizeIncidentOutputSchema},
  prompt: `You are a security analyst summarizing incident details to help prioritize alerts.

  Summarize the following incident details, highlighting key information and potential risks:

  {{{incidentDetails}}}
  `,
});

const summarizeIncidentFlow = ai.defineFlow(
  {
    name: 'summarizeIncidentFlow',
    inputSchema: SummarizeIncidentInputSchema,
    outputSchema: SummarizeIncidentOutputSchema,
  },
  async input => {
    const {output} = await summarizeIncidentPrompt(input);
    return output!;
  }
);
