console.log("🧠 NER Worker: I am alive!");

self.onmessage = (event) => {
  // This is where we will receive messages from the service worker
  console.log("NER Worker received a message:", event.data);
};