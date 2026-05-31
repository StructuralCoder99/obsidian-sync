import {
	Notice,
	Plugin,
	TAbstractFile,
	requestUrl
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	UnifiedSyncSettings,
	UnifiedSyncSettingTab,
} from './settings';
import { syncWithGit } from './sync-git';
import { syncWithFirebase } from './sync-firebase';

export default class UnifiedSyncPlugin extends Plugin {
	settings!: UnifiedSyncSettings;
	private syncIntervalId: number | null = null;
	private isSyncing = false;

	async onload() {
		await this.loadSettings();
		this.applyNoticePosition();

		// Trigger automatic update check on startup after a 2-second delay
		if (this.settings.autoUpdate) {
			setTimeout(() => this.checkForUpdates(), 2000);
		}

		// Add Ribbon Icon for Manual Sync
		this.addRibbonIcon('refresh-cw', 'Sync Vault', async (evt: MouseEvent) => {
			this.showNotice('Starting manual sync...', 'info');
			await this.triggerSync('manual');
		});

		// Add Command for Manual Sync
		this.addCommand({
			id: 'trigger-sync',
			name: 'Sync Vault Now',
			callback: async () => {
				this.showNotice('Starting sync...', 'info');
				await this.triggerSync('command');
			},
		});

		// Setup Settings Tab
		this.addSettingTab(new UnifiedSyncSettingTab(this.app, this));

		// Setup Interval Sync
		this.setupIntervalSync();

		// Setup On-Save (Modify) Sync
		this.registerEvent(
			this.app.vault.on('modify', async (file: TAbstractFile) => {
				if (this.settings.syncOnSave) {
					console.log(`[Unified Sync] File modified: ${file.path}. Triggering on-save sync.`);
					await this.triggerSync('on-save');
				}
			})
		);
	}

	onunload() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
		}
		// Clean up notice position classes on unload
		document.body.classList.remove(
			'unified-sync-notices-top-right',
			'unified-sync-notices-top-left',
			'unified-sync-notices-bottom-right',
			'unified-sync-notices-bottom-left'
		);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<UnifiedSyncSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	public setupIntervalSync() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}

		if (this.settings.syncIntervalMinutes > 0) {
			const ms = this.settings.syncIntervalMinutes * 60 * 1000;
			this.syncIntervalId = window.setInterval(() => {
				console.log(`[Unified Sync] Triggering interval sync.`);
				this.triggerSync('interval');
			}, ms);
			// Register so it gets cleaned up if plugin is unloaded
			this.registerInterval(this.syncIntervalId);
		}
	}

	public async triggerSync(source: string) {
		if (this.isSyncing) {
			console.log(`[Unified Sync] Sync already in progress, skipping (${source}).`);
			return;
		}

		this.isSyncing = true;
		try {
			if (this.settings.backendType === 'git') {
				await syncWithGit(this);
			} else if (this.settings.backendType === 'firebase') {
				await syncWithFirebase(this);
			}
			this.showNotice(`Sync completed successfully! (${source})`, 'success');
		} catch (error) {
			console.error('[Unified Sync] Sync failed:', error);
			this.showNotice('Sync failed. Check console for details.', 'error');
		} finally {
			this.isSyncing = false;
		}
	}

	public applyNoticePosition() {
		document.body.classList.remove(
			'unified-sync-notices-top-right',
			'unified-sync-notices-top-left',
			'unified-sync-notices-bottom-right',
			'unified-sync-notices-bottom-left'
		);
		document.body.classList.add(`unified-sync-notices-${this.settings.noticePosition}`);
	}

	public showNotice(message: string, type: 'info' | 'success' | 'error' = 'info') {
		const notice = new Notice(message);
		if (this.settings.noticeTheme === 'unified-glass') {
			notice.noticeEl.classList.add('unified-sync-notice');
			notice.noticeEl.classList.add(`unified-sync-notice-${type}`);
		}
	}

	public async checkForUpdates(manual = false) {
		try {
			if (manual) {
				this.showNotice('Checking for updates...', 'info');
			}
			
			const repo = 'StructuralCoder99/obsidian-sync';
			const url = `https://api.github.com/repos/${repo}/releases/latest`;
			
			const response = await requestUrl({
				url: url,
				headers: {
					'Accept': 'application/vnd.github.v3+json',
					'User-Agent': 'Obsidian-Unified-Sync'
				}
			});
			
			if (response.status !== 200) {
				throw new Error(`GitHub API returned status ${response.status}`);
			}
			
			const release = response.json;
			const remoteVersion = release.tag_name.replace(/^v/, '');
			const localVersion = this.manifest.version;
			
			if (remoteVersion === localVersion) {
				if (manual) {
					this.showNotice(`Plugin is up to date (v${localVersion}).`, 'success');
				}
				return;
			}
			
			this.showNotice(`New version v${remoteVersion} available! Updating...`, 'info');
			
			const assets = release.assets;
			const mainAsset = assets.find((a: any) => a.name === 'main.js');
			const manifestAsset = assets.find((a: any) => a.name === 'manifest.json');
			const stylesAsset = assets.find((a: any) => a.name === 'styles.css');
			
			if (!mainAsset || !manifestAsset) {
				throw new Error('Release assets are missing main.js or manifest.json');
			}
			
			const pluginDir = this.app.vault.configDir + '/plugins/' + this.manifest.id;
			
			// Download assets
			const mainRes = await requestUrl({ url: mainAsset.browser_download_url });
			const manifestRes = await requestUrl({ url: manifestAsset.browser_download_url });
			
			await this.app.vault.adapter.write(`${pluginDir}/main.js`, mainRes.text);
			await this.app.vault.adapter.write(`${pluginDir}/manifest.json`, manifestRes.text);
			
			if (stylesAsset) {
				const stylesRes = await requestUrl({ url: stylesAsset.browser_download_url });
				await this.app.vault.adapter.write(`${pluginDir}/styles.css`, stylesRes.text);
			}
			
			this.showNotice(`Successfully updated to v${remoteVersion}! Reloading...`, 'success');
			
			// Programmatically reload the plugin after 1 second
			setTimeout(async () => {
				const plugins = (this.app as any).plugins;
				await plugins.disablePlugin(this.manifest.id);
				await plugins.enablePlugin(this.manifest.id);
			}, 1000);
		} catch (error) {
			console.error('[Unified Sync] Update check failed:', error);
			if (manual) {
				this.showNotice('Update check failed. Check console for details.', 'error');
			}
		}
	}
}
