// Maps each finding `type` to a category group used for dashboard reporting and
// admin feature toggles. Keep in sync with rules.js / engine.js finding types.

export const TYPE_TO_CATEGORY = {
    // PII
    credit_card: 'pii',
    ssn: 'pii',
    phone_number: 'pii',
    email_address: 'pii',
    aadhaar_number: 'pii',
    pan_card: 'pii',
    // Secrets / credentials
    aws_access_key: 'secrets',
    aws_secret_key: 'secrets',
    stripe_key: 'secrets',
    gcp_service_account: 'secrets',
    azure_storage_key: 'secrets',
    github_token: 'secrets',
    slack_token: 'secrets',
    jwt: 'secrets',
    // Financial
    iban: 'financial',
    us_bank_account: 'financial',
    us_routing_number: 'financial',
    cvv: 'financial',
    // Medical
    icd9_code: 'medical',
    icd10_code: 'medical',
    // NER
    ner_PER: 'ner',
    ner_ORG: 'ner',
    ner_LOC: 'ner',
    // Keyword warnings
    sensitive_keyword: 'keyword',
    // Admin-defined custom rules
    custom: 'custom'
};

export function categoryOf(type) {
    if (TYPE_TO_CATEGORY[type]) return TYPE_TO_CATEGORY[type];
    if (typeof type === 'string' && type.startsWith('ner_')) return 'ner';
    return 'pii';
}
