import {
	Notice,
	Plugin,
	TAbstractFile
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
}
