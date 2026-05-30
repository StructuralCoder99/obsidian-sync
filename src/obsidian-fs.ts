import { App, DataAdapter, Stat } from 'obsidian';

export class ObsidianFS {
	private adapter: DataAdapter;

	constructor(app: App) {
		this.adapter = app.vault.adapter;
	}

	get promises() {
		return {
			readFile: async (filepath: string, options?: { encoding?: string } | string) => {
				const path = this.normalize(filepath);
				const encoding = typeof options === 'string' ? options : options?.encoding;
				
				if (encoding === 'utf8') {
					return await this.adapter.read(path);
				} else {
					const ab = await this.adapter.readBinary(path);
					return new Uint8Array(ab);
				}
			},
			writeFile: async (filepath: string, data: string | Uint8Array, options?: any) => {
				const path = this.normalize(filepath);
				if (typeof data === 'string') {
					await this.adapter.write(path, data);
				} else {
					// Extract the underlying ArrayBuffer
					const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
					await this.adapter.writeBinary(path, buffer);
				}
			},
			unlink: async (filepath: string) => {
				await this.adapter.remove(this.normalize(filepath));
			},
			readdir: async (filepath: string) => {
				const path = this.normalize(filepath);
				const list = await this.adapter.list(path);
				return [...list.files, ...list.folders].map(f => {
					const parts = f.split('/');
					return parts[parts.length - 1];
				});
			},
			mkdir: async (filepath: string) => {
				try {
					await this.adapter.mkdir(this.normalize(filepath));
				} catch (e) {
					// Ignore if exists
				}
			},
			rmdir: async (filepath: string) => {
				await this.adapter.rmdir(this.normalize(filepath), false);
			},
			stat: async (filepath: string) => {
				return this.getStat(filepath);
			},
			lstat: async (filepath: string) => {
				return this.getStat(filepath);
			},
			readlink: async (filepath: string) => {
				throw new Error('readlink not implemented');
			},
			symlink: async (target: string, filepath: string) => {
				throw new Error('symlink not implemented');
			}
		};
	}

	private normalize(path: string): string {
		let p = path.replace(/\\/g, '/');
		if (p.startsWith('/')) p = p.substring(1);
		return p;
	}

	private async getStat(filepath: string) {
		const path = this.normalize(filepath);
		const stat = await this.adapter.stat(path);
		if (!stat) throw new Error(`ENOENT: no such file or directory, stat '${path}'`);

		return {
			isFile: () => stat.type === 'file',
			isDirectory: () => stat.type === 'folder',
			isSymbolicLink: () => false,
			size: stat.size,
			mtimeMs: stat.mtime,
			ctimeMs: stat.ctime,
			uid: 1,
			gid: 1,
			dev: 1,
			ino: 0,
			mode: stat.type === 'folder' ? 0o777 : 0o666,
		};
	}
}
