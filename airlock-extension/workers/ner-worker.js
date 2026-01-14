
import { pipeline, env } from '../vendor/transformers.min.js';

// Configure environment to use wasm and disable local models
env.allowLocalModels = false;
env.useWASM = true;

// --- Singleton class for NER pipeline ---
class NerPipeline {
    static task = 'token-classification';
    static model = 'Xenova/bert-base-multilingual-cased-ner-hrl';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            // CRITICAL FIX: This line MUST be here. It configures the AI library to be single-threaded,
            // preventing the `blob:` error. It can only run right before the pipeline is created.
            env.backends.onnx.wasm.numThreads = 1;
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

// --- Main message handler ---
self.onmessage = async (event) => {
    const { text } = event.data;

    try {
        console.log("🧠 NER Worker: Received text, loading pipeline...");
        const ner = await NerPipeline.getInstance();
        console.log("🧠 NER Worker: Pipeline loaded, performing NER analysis...");
        
        const results = await ner(text);

        console.log("🧠 NER Worker: Analysis complete, raw tokens:", results);

        // --- CORRECTED GROUPING LOGIC --- 
        // Reconstruct entities from individual tokens.
        const findings = [];
        let currentFinding = null;

        for (const token of results) {
            const entity = token.entity.substring(2); // e.g., ORG, PER

            if (token.entity.startsWith('B-')) {
                // This is the beginning of a new entity.
                // First, save the previous one if it exists.
                if (currentFinding) {
                    findings.push(currentFinding);
                }
                // Start a new finding.
                currentFinding = {
                    type: `ner_${entity}`,
                    matchedText: token.word
                };
            } else if (token.entity.startsWith('I-')) {
                // This token is inside an existing entity.
                if (currentFinding && `ner_${entity}` === currentFinding.type) {
                    // This token continues the current finding.
                    if (token.word.startsWith('##')) {
                        currentFinding.matchedText += token.word.substring(2);
                    } else {
                        currentFinding.matchedText += ' ' + token.word;
                    }
                } // else: This is an orphaned 'I-' token, we will ignore it.

            } else {
                // This is an 'O' token (outside any entity).
                // If we were in the middle of a finding, it has now ended.
                if (currentFinding) {
                    findings.push(currentFinding);
                    currentFinding = null;
                }
            }
        }
        // Add the last finding if one was in progress.
        if (currentFinding) {
            findings.push(currentFinding);
        }

        // --- POST-PROCESSING CLEANUP ---
        // After grouping, clean up spacing issues introduced by tokenization.
        for (const finding of findings) {
            // Remove any space that appears before a punctuation mark.
            // e.g., "Inc ." becomes "Inc."
            finding.matchedText = finding.matchedText.replace(/ ([.,?!:;])/g, '$1');
        }

        // Add the descriptive 'finding' text after grouping is complete.
        for(const finding of findings) {
            finding.finding = `Detected a potential ${finding.type.replace('ner_', '')}: ${finding.matchedText}`;
        }
        
        console.log("🧠 NER Worker: Grouped findings:", findings);
        self.postMessage({ type: 'NER_RESULT', findings });

    } catch (error) {
        console.error("🧠 NER Worker: Error during analysis:", error);
        self.postMessage({ type: 'NER_ERROR', error: error.message });
    }
};
