
import type {
  Incident,
  PolicyPack,
  EventsByTimeData,
  LeaksByTypeData,
  LeaksByDomainData,
} from '@/lib/types';
import { PlaceHolderImages } from './placeholder-images';

const userAvatars = PlaceHolderImages.reduce((acc, img) => {
  acc[img.id] = img.imageUrl;
  return acc;
}, {} as Record<string, string>);

export const incidents: Incident[] = [
  {
    id: "INC-001",
    timestamp: "2024-07-22T10:30:00Z",
    domain: "openai.com",
    userIdHash: "a1b2c3d4",
    types: ["PII", "Source Code"],
    action: "Blocked",
    riskScore: 95,
  },
  {
    id: "INC-002",
    timestamp: "2024-07-22T11:05:00Z",
    domain: "google.com",
    userIdHash: "e5f6g7h8",
    types: ["Financial"],
    action: "Warned",
    riskScore: 75,
  },
  {
    id: "INC-003",
    timestamp: "2024-07-21T14:00:00Z",
    domain: "claude.ai",
    userIdHash: "i9j0k1l2",
    types: ["PHI"],
    action: "Blocked",
    riskScore: 92,
  },
  {
    id: "INC-004",
    timestamp: "2024-07-20T09:15:00Z",
    domain: "huggingface.co",
    userIdHash: "a1b2c3d4",
    types: ["Secrets"],
    action: "Allowed",
    riskScore: 40,
  },
  {
    id: "INC-005",
    timestamp: "2024-07-19T18:20:00Z",
    domain: "perplexity.ai",
    userIdHash: "m3n4o5p6",
    types: ["PII"],
    action: "Warned",
    riskScore: 68,
  },
];

export const policyPacks: PolicyPack[] = [
    {
        id: "pp-001",
        name: "PII & PHI Detection",
        description: "Detects common Personally Identifiable Information (PII) and Protected Health Information (PHI) patterns, such as social security numbers, credit card numbers, and medical record numbers.",
        rules: ["SSN", "Credit Card", "Phone Number", "ICD-10 Code"]
    },
    {
        id: "pp-002",
        name: "Secrets & Credentials",
        description: "Scans for API keys, private keys, and other credentials from common services like AWS, Google Cloud, and GitHub.",
        rules: ["AWS Key", "GCP Key", "RSA Private Key", "Slack Webhook"]
    },
    {
        id: "pp-003",
        name: "Financial Data Protection",
        description: "Identifies financial data such as bank account numbers, routing numbers, and stock ticker symbols.",
        rules: ["IBAN", "Routing Number", "CUSIP"]
    },
    {
        id: "pp-004",
        name: "Source Code Leakage",
        description: "Prevents proprietary source code from being leaked to external services or public domains.",
        rules: ["Java Code Snippet", "Python Code Snippet", "JS Code Snippet"]
    }
];

export const eventsByTime: EventsByTimeData[] = [
  { date: 'Jul 16', Blocked: 2, Warned: 5, Allowed: 20 },
  { date: 'Jul 17', Blocked: 3, Warned: 7, Allowed: 22 },
  { date: 'Jul 18', Blocked: 4, Warned: 6, Allowed: 25 },
  { date: 'Jul 19', Blocked: 5, Warned: 9, Allowed: 23 },
  { date: 'Jul 20', Blocked: 6, Warned: 10, Allowed: 28 },
  { date: 'Jul 21', Blocked: 8, Warned: 12, Allowed: 30 },
  { date: 'Jul 22', Blocked: 7, Warned: 11, Allowed: 29 },
];

export const leaksByType: LeaksByTypeData[] = [
    { type: 'PII', count: 45, fill: 'var(--color-chart-1)' },
    { type: 'Secrets', count: 30, fill: 'var(--color-chart-2)' },
    { type: 'PHI', count: 20, fill: 'var(--color-chart-3)' },
    { type: 'Financial', count: 35, fill: 'var(--color-chart-4)' },
    { type: 'Source Code', count: 15, fill: 'var(--color-chart-5)' },
  ];

export const leaksByDomain: LeaksByDomainData[] = [
  { domain: 'openai.com', count: 58 },
  { domain: 'google.com', count: 42 },
  { domain: 'claude.ai', count: 25 },
  { domain: 'perplexity.ai', count: 18 },
  { domain: 'huggingface.co', count: 9 },
];

export const totalEvents = eventsByTime.reduce((acc, day) => acc + day.Blocked + day.Warned + day.Allowed, 0);
export const totalBlocks = eventsByTime.reduce((acc, day) => acc + day.Blocked, 0);
export const totalWarnings = eventsByTime.reduce((acc, day) => acc + day.Warned, 0);
export const totalBypasses = incidents.filter(inc => inc.action === 'Warned').length; // Simplified for demo
