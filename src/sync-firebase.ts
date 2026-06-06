import { TFile } from 'obsidian';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import UnifiedSyncPlugin from './main';

let firebaseApp: any = null;
let db: any = null;

export async function syncWithFirebase(plugin: UnifiedSyncPlugin) {
	const { firebaseApiKey, firebaseProjectId, firebaseAppId, firebaseCollection, firebaseSyncCache } = plugin.settings;
	const collectionName = firebaseCollection || 'vault';
	
	if (!firebaseApiKey || !firebaseProjectId || !firebaseAppId) {
		throw new Error('Firebase is not fully configured in settings.');
	}

	if (!firebaseApp) {
		const firebaseConfig = {
			apiKey: firebaseApiKey,
			projectId: firebaseProjectId,
			appId: firebaseAppId,
		};
		firebaseApp = initializeApp(firebaseConfig);
		db = getFirestore(firebaseApp);
	}

	console.log('[Unified Sync] Starting Firebase Sync...');
	
	const vault = plugin.app.vault;
	const localFiles = vault.getFiles();
	const localFilePaths = localFiles.map(f => f.path);

	// 1. Fetch all remote files to compare
	const vaultSnapshot = await getDocs(collection(db, collectionName));
	const remoteFilesMap = new Map<string, any>();
	for (const docSnap of vaultSnapshot.docs) {
		const data = docSnap.data();
		remoteFilesMap.set(data.path, data);
	}

	// 2. Check for local deletions (files in cache but not in vault)
	for (const cachedPath of Object.keys(firebaseSyncCache)) {
		if (!localFilePaths.includes(cachedPath)) {
			console.log(`[Unified Sync] Marking ${cachedPath} as deleted in Firebase (tombstone)...`);
			const docRef = doc(db, collectionName, cachedPath.replace(/\//g, '_-_'));
			const deleteTimestamp = Date.now();
			await setDoc(docRef, {
				path: cachedPath,
				deleted: true,
				modified: deleteTimestamp
			});
			delete firebaseSyncCache[cachedPath];
			
			// Update remote map so we don't accidentally process it later
			remoteFilesMap.set(cachedPath, { path: cachedPath, deleted: true, modified: deleteTimestamp });
		}
	}

	// 3. Process local files against remote
	for (const file of localFiles) {
		// Sync standard text files
		if (file.extension === 'md' || file.extension === 'canvas' || file.extension === 'css') {
			const remoteData = remoteFilesMap.get(file.path);
			const localModified = file.stat.mtime;
			const remoteModified = remoteData?.modified || 0;

			if (remoteData?.deleted) {
				if (remoteModified > localModified) {
					// Deleted remotely after our last local edit -> Delete locally
					console.log(`[Unified Sync] Deleting ${file.path} locally (deleted remotely)...`);
					await vault.trash(file, false);
					delete firebaseSyncCache[file.path];
					continue;
				} else {
					// We edited it locally after it was deleted remotely -> Resurrect
					console.log(`[Unified Sync] Resurrecting ${file.path} to Firebase...`);
					const content = await vault.cachedRead(file);
					const docRef = doc(db, collectionName, file.path.replace(/\//g, '_-_'));
					await setDoc(docRef, {
						path: file.path,
						content: content,
						modified: localModified
					});
					firebaseSyncCache[file.path] = localModified;
					continue;
				}
			}

			// If local is newer, or remote doesn't exist
			if (!remoteData || localModified > remoteModified) {
				const content = await vault.cachedRead(file);
				console.log(`[Unified Sync] Pushing ${file.path} to Firebase...`);
				const docRef = doc(db, collectionName, file.path.replace(/\//g, '_-_'));
				await setDoc(docRef, {
					path: file.path,
					content: content,
					modified: localModified
				});
				// Update cache
				firebaseSyncCache[file.path] = localModified;
			} else if (remoteModified > localModified && remoteData) {
				// Remote is newer, pull from Firebase
				console.log(`[Unified Sync] Pulling ${file.path} from Firebase...`);
				await vault.modify(file, remoteData.content);
				firebaseSyncCache[file.path] = remoteModified;
			} else {
				// They are identical, just ensure cache is populated
				firebaseSyncCache[file.path] = localModified;
			}
		}
	}

	// 4. Download new remote files
	for (const [filePath, data] of remoteFilesMap.entries()) {
		if (!data.deleted && !localFilePaths.includes(filePath)) {
			// File exists on remote but not local.
			console.log(`[Unified Sync] Downloading new file ${filePath} from Firebase...`);
			
			// Ensure folders exist
			const folders = filePath.split('/');
			folders.pop(); // remove filename
			let currentPath = '';
			for (const folder of folders) {
				currentPath += folder;
				const abstractFile = vault.getAbstractFileByPath(currentPath);
				if (!abstractFile) {
					await vault.createFolder(currentPath);
				}
				currentPath += '/';
			}

			await vault.create(filePath, data.content);
			firebaseSyncCache[filePath] = data.modified;
		}
	}

	// Save the updated cache back to settings
	await plugin.saveSettings();

	console.log('[Unified Sync] Firebase Sync Complete.');
}
