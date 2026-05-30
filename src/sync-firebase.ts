import { TFile } from 'obsidian';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import UnifiedSyncPlugin from './main';

let firebaseApp: any = null;
let db: any = null;

export async function syncWithFirebase(plugin: UnifiedSyncPlugin) {
	const { firebaseApiKey, firebaseProjectId, firebaseAppId } = plugin.settings;
	
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

	// 1. Push local changes to Firebase
	for (const file of localFiles) {
		// Skip large files or non-markdown if necessary, but for now sync all text files
		if (file.extension === 'md' || file.extension === 'canvas' || file.extension === 'css') {
			const content = await vault.cachedRead(file);
			const docRef = doc(db, 'vault', file.path.replace(/\//g, '_-_')); // sanitize path for doc ID
			
			// Get remote to check last modified
			const remoteDoc = await getDoc(docRef);
			const remoteData = remoteDoc.data();
			
			const localModified = file.stat.mtime;
			const remoteModified = remoteData?.modified || 0;

			if (!remoteDoc.exists() || localModified > remoteModified) {
				// Local is newer or remote doesn't exist, push to Firebase
				console.log(`[Unified Sync] Pushing ${file.path} to Firebase...`);
				await setDoc(docRef, {
					path: file.path,
					content: content,
					modified: localModified
				});
			} else if (remoteModified > localModified && remoteData) {
				// Remote is newer, pull from Firebase
				console.log(`[Unified Sync] Pulling ${file.path} from Firebase...`);
				await vault.modify(file, remoteData.content);
			}
		}
	}

	// 2. Fetch all remote files to check for files created on other devices
	const vaultSnapshot = await getDocs(collection(db, 'vault'));
	for (const docSnap of vaultSnapshot.docs) {
		const data = docSnap.data();
		const filePath = data.path;

		if (!localFilePaths.includes(filePath)) {
			// File exists on remote but not local. 
			// Check if it was deleted locally or created remotely.
			// This requires a more complex sync state tracking (e.g. sync token/timestamp).
			// For simple approach: if it's on remote but not local, pull it.
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
		}
	}

	console.log('[Unified Sync] Firebase Sync Complete.');
}
