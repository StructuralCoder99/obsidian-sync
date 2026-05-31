# Unified Sync for Obsidian

<p align="center">
  <b>Sync Obsidian vaults with Git or Firebase across all devices, with fully native Android Mobile support.</b>
</p>

Unified Sync is a modern, high-performance, and lightweight syncing plugin for Obsidian. It provides double-backend support for Git and Firestore (Firebase), premium glassmorphic visual indicators, custom layout configurations, and a fully autonomous self-updating system directly from your GitHub releases.

---

## 🌟 Key Features

### 🔄 Multi-Backend Syncing
- **Git Integration**: Direct integration with Git repositories using `isomorphic-git` for standard push/pull/commit version-controlled syncs.
- **Firebase Integration**: Real-time cloud sync using Google Firestore with automatic resolution of conflict/last-modified timestamps.

### 📱 Android Mobile Ready
- Standard `isomorphic-git` implementations frequently crash on Android due to missing Node.js environment built-ins (like `buffer` and `process`).
- Unified Sync is engineered with built-in **browser-compliant polyfills**, enabling seamless, error-free activation and running on Obsidian Mobile for Android.

### 🎨 Premium Glassmorphic Notifications
- Swap between default notices and a premium **Glassmorphic Theme** featuring custom animations, blur effects (`backdrop-filter`), and distinct visual colors:
  - 🔵 **Info**: For ongoing operations.
  - 🟢 **Success**: For completed syncs.
  - 🔴 **Error**: For failure alerts.
- **Custom Positioning**: Customize exactly where notices appear on your screen (Top-Right, Top-Left, Bottom-Right, or Bottom-Left).

### 🚀 Autonomous Self-Updates
- Tightly integrated update mechanism that directly queries GitHub Releases.
- Automatically compares version tags, downloads updated assets (`main.js`, `manifest.json`, `styles.css`), writes them to the plugin folder, and programmatically hot-reloads the plugin instantly without requiring an Obsidian restart.

---

## 🚀 Getting Started

### Installation

#### Option 1: Automatic Self-Updater (Recommended)
1. Download the latest version zip (`main.js`, `manifest.json`, and `styles.css`) from the [Latest Release](https://github.com/StructuralCoder99/obsidian-sync/releases).
2. Extract the files into your vault under `.obsidian/plugins/unified-sync/`.
3. Open Obsidian, go to **Community plugins**, and enable **Unified Sync**.
4. Go to **Unified Sync Settings** and ensure **Auto-Check for Updates** is enabled to receive future updates automatically!

#### Option 2: Build from Source
To clone and compile the plugin locally:
```bash
git clone https://github.com/StructuralCoder99/obsidian-sync.git
cd obsidian-sync
npm install
npm run build
```

---

## ⚙️ Settings & Configuration

Configure the plugin in Obsidian by going to **Settings** > **Unified Sync**:

1. **Sync Backend**: Toggle between **Git** and **Firebase**.
2. **Sync Settings**:
   - **Sync Interval**: Number of minutes between automated background syncs. Set to `0` to disable.
   - **Sync on Save**: Enable to trigger an automatic sync whenever you modify a file.
3. **Notification Settings**:
   - **Notice Theme**: Choose between `Default Obsidian` or `Unified Sync Glassmorphism`.
   - **Notice Position**: Set notices to show in any screen corner.
4. **Plugin Updates**:
   - Enable **Auto-Check for Updates** to fetch new versions from GitHub on startup.
   - Click **Check Now** to run a manual update check at any time.

---

## 🛠️ Developer & CI/CD Workflow

This project includes a pre-configured **GitHub Actions CI/CD pipeline** to automate compiled builds and release publishing.

### Publish a New Version
To release an update and trigger automatic updates for all installations:

1. **Commit and Push changes to GitHub**:
   ```bash
   git add -A
   git commit -m "feat: description of new features"
   git push origin master
   ```
2. **Tag and Push the new release**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

The **Publish Release** action will instantly compile your TypeScript source code and create a new GitHub Release with the bundled assets (`main.js`, `manifest.json`, and `styles.css`) attached automatically.

---

## 📄 License
This project is licensed under the 0-BSD License.
