console.log("✅ CONTENT SCRIPT LOADED");

document.addEventListener("copy", () => {
  console.log("✂ COPY DETECTED IN CONTENT SCRIPT");

  let text = "";
  try { text = document.getSelection().toString(); } catch {}

  try {
    // Use runtime connection API (never blocked by CSP)
    chrome.runtime.sendMessage(
      { type: "copy", snippet: text },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log("⚠️ Message send failed; will retry after reload.");
        } else {
          console.log("📨 MESSAGE CONFIRMED BY BACKGROUND");
        }
      }
    );
  } catch (err) {
    console.log("⚠️ Schrome.runtime unavailable (this tab is sandboxed), refresh page once.");
  }

}, true);
