import { Notice } from 'obsidian';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import UnifiedSyncPlugin from './main';
import { ObsidianFS } from './obsidian-fs';

export async function syncWithGit(plugin: UnifiedSyncPlugin) {
	try {
		const fs = new ObsidianFS(plugin.app);
		const dir = '/';

		// Initialize repo if needed
		let isRepo = false;
		try {
			await fs.promises.stat('.git');
			isRepo = true;
		} catch (e) {
			isRepo = false;
		}

		if (!isRepo) {
			console.log('[Unified Sync] Initializing git repository...');
			await git.init({ fs, dir });
		}

		if (!plugin.settings.gitRepoUrl) {
			new Notice('Git Repo URL is not configured in settings.');
			return;
		}

		const remoteUrl = plugin.settings.gitRepoUrl;
		
		// Configure remote
		try {
			await git.addRemote({ fs, dir, remote: 'origin', url: remoteUrl });
		} catch (e) {
			// Remote might already exist, so let's just make sure it's correct
			// isomorphic-git doesn't have an easy set-url, so we don't strict error here
		}

		const onAuth = () => {
			return {
				username: plugin.settings.gitUsername,
				password: plugin.settings.gitToken,
			};
		};

		// Pull remote changes
		console.log('[Unified Sync] Pulling from origin...');
		try {
			await git.pull({
				fs,
				http,
				dir,
				ref: 'main',
				singleBranch: true,
				author: {
					name: plugin.settings.gitUsername || 'Unified Sync',
					email: 'sync@example.com',
				},
				onAuth
			});
		} catch (pullError) {
			console.log('[Unified Sync] Pull failed, maybe new repo or conflict', pullError);
		}

		// Add all files
		console.log('[Unified Sync] Staging changes...');
		
		// Obsidian files are usually markdown. isomorphic-git statusMatrix helps us find modified/untracked files.
		const status = await git.statusMatrix({ fs, dir });
		let hasChanges = false;
		
		for (const row of status) {
			const filepath = row[0];
			const headStatus = row[1];
			const workdirStatus = row[2];
			const stageStatus = row[3];

			// Skip .git folder itself
			if (filepath.startsWith('.git')) continue;

			// If file is changed in workdir
			if (workdirStatus !== headStatus || workdirStatus !== stageStatus) {
				hasChanges = true;
				if (workdirStatus === 0) {
					// Deleted
					await git.remove({ fs, dir, filepath });
				} else {
					// Added or Modified
					await git.add({ fs, dir, filepath });
				}
			}
		}

		if (hasChanges) {
			console.log('[Unified Sync] Committing changes...');
			await git.commit({
				fs,
				dir,
				message: `Sync vault from device - ${new Date().toISOString()}`,
				author: {
					name: plugin.settings.gitUsername || 'Unified Sync',
					email: 'sync@example.com',
				}
			});
			
			// Push
			console.log('[Unified Sync] Pushing to origin...');
			await git.push({
				fs,
				http,
				dir,
				remote: 'origin',
				ref: 'main',
				onAuth
			});
		} else {
			console.log('[Unified Sync] No local changes to commit.');
		}

	} catch (error) {
		console.error('[Unified Sync] Git Sync Error:', error);
		throw error;
	}
}
