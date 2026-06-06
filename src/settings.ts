import { App, PluginSettingTab, Setting } from 'obsidian';
import UnifiedSyncPlugin from './main';

export interface UnifiedSyncSettings {
	backendType: 'git' | 'firebase';
	syncIntervalMinutes: number;
	syncOnSave: boolean;
	
	// Git Settings
	gitRepoUrl: string;
	gitUsername: string;
	gitToken: string;
	gitBranch: string;

	// Firebase Settings
	firebaseApiKey: string;
	firebaseProjectId: string;
	firebaseAppId: string;
	firebaseCollection: string;

	// Internal state to track Firebase sync and prevent duplication
	firebaseSyncCache: Record<string, number>;

	// Notice Settings
	noticeTheme: 'default' | 'unified-glass';
	noticePosition: 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left' | 'bottom-center' | 'center';
	showOnSaveNotices: boolean;

	// Auto-Update Settings
	autoUpdate: boolean;
}

export const DEFAULT_SETTINGS: UnifiedSyncSettings = {
	backendType: 'git',
	syncIntervalMinutes: 2,
	syncOnSave: true,
	gitRepoUrl: '',
	gitUsername: '',
	gitToken: '',
	gitBranch: 'main',
	firebaseApiKey: '',
	firebaseProjectId: '',
	firebaseAppId: '',
	firebaseCollection: 'vault',
	firebaseSyncCache: {},
	noticeTheme: 'unified-glass',
	noticePosition: 'top-right',
	showOnSaveNotices: false,
	autoUpdate: true
}

export class UnifiedSyncSettingTab extends PluginSettingTab {
	plugin: UnifiedSyncPlugin;

	constructor(app: App, plugin: UnifiedSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Sync Backend')
			.setDesc('Choose between Git or Firebase for syncing your vault.')
			.addDropdown(drop => drop
				.addOption('git', 'Git')
				.addOption('firebase', 'Firebase')
				.setValue(this.plugin.settings.backendType)
				.onChange(async (value) => {
					this.plugin.settings.backendType = value as 'git' | 'firebase';
					await this.plugin.saveSettings();
					this.display(); // Refresh to show relevant settings
				}));

		new Setting(containerEl)
			.setName('Sync Interval (Minutes)')
			.setDesc('How often to sync automatically in the background. Set to 0 to disable.')
			.addText(text => text
				.setPlaceholder('2')
				.setValue(String(this.plugin.settings.syncIntervalMinutes))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num)) {
						this.plugin.settings.syncIntervalMinutes = num;
						await this.plugin.saveSettings();
						this.plugin.setupIntervalSync();
					}
				}));

		new Setting(containerEl)
			.setName('Sync on Save')
			.setDesc('Automatically trigger a sync when a file is modified.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncOnSave)
				.onChange(async (value) => {
					this.plugin.settings.syncOnSave = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh settings tab to show/hide conditional options
				}));

		if (this.plugin.settings.syncOnSave) {
			new Setting(containerEl)
				.setName('Show notifications for on-save sync')
				.setDesc('Show notifications when on-save sync completes successfully. Failures will always show alerts.')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.showOnSaveNotices)
					.onChange(async (value) => {
						this.plugin.settings.showOnSaveNotices = value;
						await this.plugin.saveSettings();
					}));
		}

		containerEl.createEl('h3', {text: 'Notification Settings'});

		new Setting(containerEl)
			.setName('Notice Theme')
			.setDesc('Customize the look and feel of sync notifications.')
			.addDropdown(drop => drop
				.addOption('default', 'Default Obsidian')
				.addOption('unified-glass', 'Unified Sync Glassmorphism')
				.setValue(this.plugin.settings.noticeTheme)
				.onChange(async (value) => {
					this.plugin.settings.noticeTheme = value as 'default' | 'unified-glass';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Notice Position')
			.setDesc('Choose where notifications should appear in Obsidian.')
			.addDropdown(drop => drop
				.addOption('top-right', 'Top right')
				.addOption('top-left', 'Top left')
				.addOption('top-center', 'Top center')
				.addOption('bottom-right', 'Bottom right')
				.addOption('bottom-left', 'Bottom left')
				.addOption('bottom-center', 'Bottom center')
				.addOption('center', 'Screen center')
				.setValue(this.plugin.settings.noticePosition)
				.onChange(async (value) => {
					this.plugin.settings.noticePosition = value as UnifiedSyncSettings['noticePosition'];
					await this.plugin.saveSettings();
					this.plugin.applyNoticePosition();
				}));

		containerEl.createEl('h3', {text: 'Plugin Updates'});

		new Setting(containerEl)
			.setName('Auto-Check for Updates')
			.setDesc('Check for updates automatically on startup.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoUpdate)
				.onChange(async (value) => {
					this.plugin.settings.autoUpdate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Check for Updates')
			.setDesc('Check for newer releases on GitHub and update the plugin.')
			.addButton(button => button
				.setButtonText('Check Now')
				.setCta()
				.onClick(async () => {
					await this.plugin.checkForUpdates(true);
				}));

		if (this.plugin.settings.backendType === 'git') {
			containerEl.createEl('h3', {text: 'Git settings'});
			
			// Check if we can autofill Git config from localStorage
			const cachedGitConfigStr = window.localStorage.getItem('unified-sync-git-config');
			if (cachedGitConfigStr && (!this.plugin.settings.gitRepoUrl || !this.plugin.settings.gitUsername || !this.plugin.settings.gitToken)) {
				try {
					interface CachedGitConfig {
						repoUrl?: string;
						username?: string;
						token?: string;
					}
					const cachedGitConfig = JSON.parse(cachedGitConfigStr) as CachedGitConfig;
					if (cachedGitConfig.repoUrl && cachedGitConfig.username && cachedGitConfig.token) {
						new Setting(containerEl)
							.setName('Autofill Git configuration')
							.setDesc('Saved Git credentials from another vault were found on this device.')
							.addButton(button => button
								.setButtonText('Autofill now')
								.setCta()
								.onClick(async () => {
									this.plugin.settings.gitRepoUrl = cachedGitConfig.repoUrl || '';
									this.plugin.settings.gitUsername = cachedGitConfig.username || '';
									this.plugin.settings.gitToken = cachedGitConfig.token || '';
									await this.plugin.saveSettings();
									this.plugin.showNotice('Autofilled Git credentials!', 'success');
									this.display();
								}));
					}
				} catch (e) {
					console.error('[Unified Sync] Failed to parse cached Git config:', e);
				}
			}

			new Setting(containerEl)
				.setName('Repository URL')
				.setDesc('The remote Git repository URL (HTTPS).')
				.addText(text => text
					.setPlaceholder('https://github.com/user/repo.git')
					.setValue(this.plugin.settings.gitRepoUrl)
					.onChange(async (value) => {
						this.plugin.settings.gitRepoUrl = value;
						await this.plugin.saveSettings();
						this.updateLocalStorageGitConfig();
					}));
			
			new Setting(containerEl)
				.setName('Username')
				.addText(text => text
					.setValue(this.plugin.settings.gitUsername)
					.onChange(async (value) => {
						this.plugin.settings.gitUsername = value;
						await this.plugin.saveSettings();
						this.updateLocalStorageGitConfig();
					}));
			
			new Setting(containerEl)
				.setName('Personal access token (PAT)')
				.setDesc('Used for HTTPS authentication.')
				.addText(text => text
					.setValue(this.plugin.settings.gitToken)
					.onChange(async (value) => {
						this.plugin.settings.gitToken = value;
						await this.plugin.saveSettings();
						this.updateLocalStorageGitConfig();
					}));

			new Setting(containerEl)
				.setName('Git branch')
				.setDesc('Branch to use for sync (e.g. Main, vault-work, device-a).')
				.addText(text => text
					.setPlaceholder('Main')
					.setValue(this.plugin.settings.gitBranch || 'main')
					.onChange(async (value) => {
						this.plugin.settings.gitBranch = value || 'main';
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Share Git configuration')
				.setDesc('Export or import Git credentials via the clipboard.')
				.addButton(button => button
					.setButtonText('Export')
					.onClick(async () => {
						const config = {
							repoUrl: this.plugin.settings.gitRepoUrl,
							username: this.plugin.settings.gitUsername,
							token: this.plugin.settings.gitToken,
						};
						if (!config.repoUrl || !config.username || !config.token) {
							this.plugin.showNotice('Git credentials are not fully configured to export.', 'error');
							return;
						}
						const encoded = btoa(JSON.stringify(config));
						await navigator.clipboard.writeText(encoded);
						this.plugin.showNotice('Git configuration copied to clipboard!', 'success');
					}))
				.addButton(button => button
					.setButtonText('Import')
					.onClick(async () => {
						try {
							const text = await navigator.clipboard.readText();
							if (!text) {
								this.plugin.showNotice('Clipboard is empty.', 'error');
								return;
							}
							interface ImportGitConfig {
								repoUrl?: string;
								username?: string;
								token?: string;
							}
							const decoded = JSON.parse(atob(text.trim())) as ImportGitConfig;
							if (decoded.repoUrl && decoded.username && decoded.token) {
								this.plugin.settings.gitRepoUrl = decoded.repoUrl;
								this.plugin.settings.gitUsername = decoded.username;
								this.plugin.settings.gitToken = decoded.token;
								await this.plugin.saveSettings();
								this.updateLocalStorageGitConfig();
								this.plugin.showNotice('Git configuration imported successfully!', 'success');
								this.display();
							} else {
								throw new Error('Invalid configuration.');
							}
						} catch (e) {
							this.plugin.showNotice('Failed to import configuration from clipboard.', 'error');
						}
					}));
		} else {
			containerEl.createEl('h3', {text: 'Firebase settings'});

			// Check if we can autofill Firebase config from localStorage
			const cachedFirebaseConfigStr = window.localStorage.getItem('unified-sync-firebase-config');
			if (cachedFirebaseConfigStr && (!this.plugin.settings.firebaseApiKey || !this.plugin.settings.firebaseProjectId || !this.plugin.settings.firebaseAppId)) {
				try {
					interface CachedFirebaseConfig {
						apiKey?: string;
						projectId?: string;
						appId?: string;
					}
					const cachedFirebaseConfig = JSON.parse(cachedFirebaseConfigStr) as CachedFirebaseConfig;
					if (cachedFirebaseConfig.apiKey && cachedFirebaseConfig.projectId && cachedFirebaseConfig.appId) {
						new Setting(containerEl)
							.setName('Autofill firebase configuration')
							.setDesc('Saved firebase credentials from another vault were found on this device.')
							.addButton(button => button
								.setButtonText('Autofill now')
								.setCta()
								.onClick(async () => {
									this.plugin.settings.firebaseApiKey = cachedFirebaseConfig.apiKey || '';
									this.plugin.settings.firebaseProjectId = cachedFirebaseConfig.projectId || '';
									this.plugin.settings.firebaseAppId = cachedFirebaseConfig.appId || '';
									await this.plugin.saveSettings();
									this.plugin.showNotice('Autofilled Firebase credentials!', 'success');
									this.display();
								}));
					}
				} catch (e) {
					console.error('[Unified Sync] Failed to parse cached Firebase config:', e);
				}
			}
			
			new Setting(containerEl)
				.setName('Firebase API key')
				.addText(text => text
					.setValue(this.plugin.settings.firebaseApiKey)
					.onChange(async (value) => {
						this.plugin.settings.firebaseApiKey = value;
						await this.plugin.saveSettings();
						this.updateLocalStorageFirebaseConfig();
					}));
					
			new Setting(containerEl)
				.setName('Project ID')
				.addText(text => text
					.setValue(this.plugin.settings.firebaseProjectId)
					.onChange(async (value) => {
						this.plugin.settings.firebaseProjectId = value;
						await this.plugin.saveSettings();
						this.updateLocalStorageFirebaseConfig();
					}));
					
			new Setting(containerEl)
				.setName('App ID')
				.addText(text => text
					.setValue(this.plugin.settings.firebaseAppId)
					.onChange(async (value) => {
						this.plugin.settings.firebaseAppId = value;
						await this.plugin.saveSettings();
						this.updateLocalStorageFirebaseConfig();
					}));

			new Setting(containerEl)
				.setName('Firebase collection')
				.setDesc('Firestore collection name for this vault (e.g. Vault, personal-vault).')
				.addText(text => text
					.setPlaceholder('Vault')
					.setValue(this.plugin.settings.firebaseCollection || 'vault')
					.onChange(async (value) => {
						this.plugin.settings.firebaseCollection = value || 'vault';
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Share firebase configuration')
				.setDesc('Export or import firebase credentials via the clipboard.')
				.addButton(button => button
					.setButtonText('Export')
					.onClick(async () => {
						const config = {
							apiKey: this.plugin.settings.firebaseApiKey,
							projectId: this.plugin.settings.firebaseProjectId,
							appId: this.plugin.settings.firebaseAppId,
						};
						if (!config.apiKey || !config.projectId || !config.appId) {
							this.plugin.showNotice('Firebase credentials are not fully configured to export.', 'error');
							return;
						}
						const encoded = btoa(JSON.stringify(config));
						await navigator.clipboard.writeText(encoded);
						this.plugin.showNotice('Firebase configuration copied to clipboard!', 'success');
					}))
				.addButton(button => button
					.setButtonText('Import')
					.onClick(async () => {
						try {
							const text = await navigator.clipboard.readText();
							if (!text) {
								this.plugin.showNotice('Clipboard is empty.', 'error');
								return;
							}
							interface ImportFirebaseConfig {
								apiKey?: string;
								projectId?: string;
								appId?: string;
							}
							const decoded = JSON.parse(atob(text.trim())) as ImportFirebaseConfig;
							if (decoded.apiKey && decoded.projectId && decoded.appId) {
								this.plugin.settings.firebaseApiKey = decoded.apiKey;
								this.plugin.settings.firebaseProjectId = decoded.projectId;
								this.plugin.settings.firebaseAppId = decoded.appId;
								await this.plugin.saveSettings();
								this.updateLocalStorageFirebaseConfig();
								this.plugin.showNotice('Firebase configuration imported successfully!', 'success');
								this.display();
							} else {
								throw new Error('Invalid configuration.');
							}
						} catch (e) {
							this.plugin.showNotice('Failed to import configuration from clipboard.', 'error');
						}
					}));
		}
	}

	updateLocalStorageFirebaseConfig() {
		const { firebaseApiKey, firebaseProjectId, firebaseAppId } = this.plugin.settings;
		if (firebaseApiKey && firebaseProjectId && firebaseAppId) {
			window.localStorage.setItem('unified-sync-firebase-config', JSON.stringify({
				apiKey: firebaseApiKey,
				projectId: firebaseProjectId,
				appId: firebaseAppId
			}));
		}
	}

	updateLocalStorageGitConfig() {
		const { gitRepoUrl, gitUsername, gitToken } = this.plugin.settings;
		if (gitRepoUrl && gitUsername && gitToken) {
			window.localStorage.setItem('unified-sync-git-config', JSON.stringify({
				repoUrl: gitRepoUrl,
				username: gitUsername,
				token: gitToken
			}));
		}
	}
}
