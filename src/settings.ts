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

	// Firebase Settings
	firebaseApiKey: string;
	firebaseProjectId: string;
	firebaseAppId: string;

	// Notice Settings
	noticeTheme: 'default' | 'unified-glass';
	noticePosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';

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
	firebaseApiKey: '',
	firebaseProjectId: '',
	firebaseAppId: '',
	noticeTheme: 'unified-glass',
	noticePosition: 'top-right',
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
				}));

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
				.addOption('top-right', 'Top Right')
				.addOption('top-left', 'Top Left')
				.addOption('bottom-right', 'Bottom Right')
				.addOption('bottom-left', 'Bottom Left')
				.addOption('center', 'Screen Center')
				.setValue(this.plugin.settings.noticePosition)
				.onChange(async (value) => {
					this.plugin.settings.noticePosition = value as any;
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
			containerEl.createEl('h3', {text: 'Git Settings'});
			
			new Setting(containerEl)
				.setName('Repository URL')
				.setDesc('The remote Git repository URL (HTTPS).')
				.addText(text => text
					.setPlaceholder('https://github.com/user/repo.git')
					.setValue(this.plugin.settings.gitRepoUrl)
					.onChange(async (value) => {
						this.plugin.settings.gitRepoUrl = value;
						await this.plugin.saveSettings();
					}));
			
			new Setting(containerEl)
				.setName('Username')
				.addText(text => text
					.setValue(this.plugin.settings.gitUsername)
					.onChange(async (value) => {
						this.plugin.settings.gitUsername = value;
						await this.plugin.saveSettings();
					}));
			
			new Setting(containerEl)
				.setName('Personal Access Token (PAT)')
				.setDesc('Used for HTTPS authentication.')
				.addText(text => text
					.setValue(this.plugin.settings.gitToken)
					.onChange(async (value) => {
						this.plugin.settings.gitToken = value;
						await this.plugin.saveSettings();
					}));
		} else {
			containerEl.createEl('h3', {text: 'Firebase Settings'});
			
			new Setting(containerEl)
				.setName('Firebase API Key')
				.addText(text => text
					.setValue(this.plugin.settings.firebaseApiKey)
					.onChange(async (value) => {
						this.plugin.settings.firebaseApiKey = value;
						await this.plugin.saveSettings();
					}));
					
			new Setting(containerEl)
				.setName('Project ID')
				.addText(text => text
					.setValue(this.plugin.settings.firebaseProjectId)
					.onChange(async (value) => {
						this.plugin.settings.firebaseProjectId = value;
						await this.plugin.saveSettings();
					}));
					
			new Setting(containerEl)
				.setName('App ID')
				.addText(text => text
					.setValue(this.plugin.settings.firebaseAppId)
					.onChange(async (value) => {
						this.plugin.settings.firebaseAppId = value;
						await this.plugin.saveSettings();
					}));
		}
	}
}
