console.log("✅ BACKGROUND SCRIPT ACTIVE");

chrome.runtime.onMessage.addListener((msg) => {
  console.log("📥 BACKGROUND RECEIVED:", msg);

  fetch("http://127.0.0.1:8080/extension-event", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(msg)
  })
  .then(res => console.log("✅ SENT TO SERVER:", res.status))
  .catch(err => console.log("❌ FAILED TO SEND:", err));
});
