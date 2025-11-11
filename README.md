# LeakWatch

**LeakWatch** is a local privacy and clipboard monitoring system that protects you from hidden data leaks caused by browser extensions or websites.  
It operates entirely offline, ensuring your clipboard history and browsing data never leave your device.

---

## How It Works

1. **Clipboard Listener**  
   A Chrome extension continuously monitors clipboard copy activity within active browser tabs.

2. **Local Relay**  
   Each clipboard event is securely forwarded to the **LeakWatch local backend** for real-time analysis.

3. **Traffic Monitor**  
   A local proxy inspects outgoing network requests from your browser and compares them with recent clipboard data.

4. **Leak Detection Engine**  
   If any outgoing request contains matching clipboard text, LeakWatch instantly flags it as a potential data leak.

5. **Dashboard Control**  
   Receive alerts, review details, and block or whitelist domains directly from the control dashboard.

---

## Key Features

- **Instant Leak Alerts**  
  Get notified in real time when clipboard data is detected leaving your system.

- **One-Click Domain Blocking**  
  Instantly block suspicious domains or browser extensions.

- **Activity Timeline**  
  View a chronological log of copy events, detections, and actions taken.

- **Weekly Insights**  
  Visualize leak frequency with trend graphs and risk distribution charts.

- **Security Profile**  
  Track your exposure score and review personalized privacy insights.

- **Offline and Secure**  
  No cloud storage, no external tracking — all analysis stays local to your device.
