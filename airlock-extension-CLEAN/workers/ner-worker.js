console.log("🧠 NER Worker: I am alive and ready!");

// Use importScripts to load the library in a classic worker context.
// This is a workaround for the module import issue.
self.importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');

// The library is now available on the `self` object.
const { pipeline, env } = self.transformers;

env.allowLocalModels = false; // Do not load models from local cache

class NerPipeline {
    static task = 'token-classification';
    static model = 'Xenova/bert-base-multilingual-cased-ner-hrl';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            console.log("🧠 NER Worker: Initializing model...");
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

self.onmessage = async (event) => {
    const text = event.data;
    console.log("🧠 NER Worker: Received text. Analyzing...");

    try {
        const ner = await NerPipeline.getInstance();
        const result = await ner(text, { 
            ignore_labels: ['O'] // We only care about actual entities
        });

        const findings = result.map(entity => ({
            type: "NER",
            finding: `Detected a potential ${entity.entity_group} entity: '${entity.word}'`
        }));

        console.log("🧠 NER Worker: Analysis complete. Sending results.");
        self.postMessage({ type: 'NER_RESULT', findings });

    } catch (error) {
        console.error("🧠 NER Worker: Analysis failed!", error);
        self.postMessage({ type: 'NER_RESULT', findings: [] }); // Send empty result on error
    }
};