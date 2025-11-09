document.addEventListener("copy", () => {
  let text = "";
  try { text = document.getSelection().toString(); } catch {}

  fetch("http://127.0.0.1:8080/proxy-log", {
    method: "POST",
    headers: {"Content-Type": "text/plain"},
    body: text
  }).catch(()=>{});
}, true);
