document.addEventListener("copy", () => {
  let text = "";
  try { text = document.getSelection().toString(); } catch {}

  chrome.runtime.sendMessage({
    type: "copy",
    snippet: text
  });
}, true);
