chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "copy") {
    fetch("http://127.0.0.1:8080/extension-event", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(msg)
    }).catch(err => console.log("Send failed:", err));
  }
});
