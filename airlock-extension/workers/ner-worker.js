import { pipeline, env } from '../vendor/transformers.min.js';

env.allowLocalModels = false;
env.useWASM = true;

class NerPipeline {
    static task = 'token-classification';
    static model = 'Xenova/bert-base-multilingual-cased-ner-hrl';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            env.backends.onnx.wasm.numThreads = 1;
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.onmessage = async (event) => {
    const { action, text } = event.data;

    try {
        const ner = await NerPipeline.getInstance();

        if (action === 'warmup') {
            console.log("🧠 NER Worker: Warmup complete. Model is ready.");
            self.postMessage({ status: 'ready' });
            return;
        }

        if (action === 'analyze') {
            if (!text) {
                self.postMessage({ status: 'complete', type: 'NER_RESULT', findings: [] });
                return;
            }

            console.log("🧠 NER Worker: Performing analysis...");
            const results = await ner(text);

            const findings = [];
            let currentFinding = null;
            for (const token of results) {
                const entity = token.entity.substring(2);
                if (token.entity.startsWith('B-')) {
                    if (currentFinding) findings.push(currentFinding);
                    currentFinding = { type: `ner_${entity}`, matchedText: token.word };
                } else if (token.entity.startsWith('I-')) {
                    if (currentFinding && `ner_${entity}` === currentFinding.type) {
                        if (token.word.startsWith('##')) {
                            currentFinding.matchedText += token.word.substring(2);
                        } else {
                            currentFinding.matchedText += ' ' + token.word;
                        }
                    }
                } else {
                    if (currentFinding) {
                        findings.push(currentFinding);
                        currentFinding = null;
                    }
                }
            }
            if (currentFinding) findings.push(currentFinding);

            for (const finding of findings) {
                finding.matchedText = finding.matchedText.replace(/ ([.,?!:;])/g, '$1');
                finding.finding = `Detected a potential ${finding.type.replace('ner_', '')}: ${finding.matchedText}`;
            }
            
            console.log("🧠 NER Worker: Analysis complete.", findings);
            self.postMessage({ status: 'complete', type: 'NER_RESULT', findings });
        }

    } catch (error) {
        console.error("🧠 NER Worker: Error processing message:", error);
        self.postMessage({ status: 'complete', type: 'NER_ERROR', error: error.message });
    }
};
