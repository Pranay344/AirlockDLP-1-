console.log("🧠 NER Worker: I am alive and ready for Phase 1 testing!");

// Listen for any message from the offscreen document
self.onmessage = (event) => {
  console.log("🧠 NER Worker: Received a message, sending back a dummy response.");

  // This is the hardcoded dummy finding for our test
  const dummyFindings = [{ 
    type: 'NER_TEST', 
    finding: 'This is a test finding from the NER worker.' 
  }];

  // Send the dummy response back.
  self.postMessage({ type: 'NER_RESULT', findings: dummyFindings });
};
