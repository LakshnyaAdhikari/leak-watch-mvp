# LeakWatch

LeakWatch is a local privacy monitoring system that detects when copied text (clipboard data) is sent out to external servers by browser extensions or web pages. It runs fully offline on your machine — no cloud logging, no external tracking.

### How it works
1. A Chrome extension listens for clipboard copy events in active tabs.
2. The background script forwards these events to a local backend.
3. A local proxy server watches for outgoing HTTP requests.
4. If a copied snippet appears to match data being sent out, LeakWatch flags it and alerts you on the dashboard.
5. You can choose to block the domain or allow it from the dashboard.

### Features
- Real-time data leak alerts
- Domain blocking with one click
- Event timeline + activity log
- Weekly incident trends & risk donut chart
- User security profile panel
- Fully offline — everything stays on your device

### Requirements
- Chrome browser
- Node.js installed
- Windows/Mac/Linux supported

### Setup
```bash
cd proxy-server
npm install
node index.js
