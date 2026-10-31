/// <reference types="@rspack/core/module" />

declare global {
	interface Document {
		parseHTMLUnsafe(markup: string): Document;
	}

	interface WebSocketStreamOptions {
		protocols?: string[];
		signal?: AbortSignal;
	}

	interface WebSocketStreamCloseInfo {
		closeCode?: number;
		reason?: string;
	}

	interface WebSocketStreamOpenedInfo {
		readable: ReadableStream<string | ArrayBuffer | Blob>;
		writable: WritableStream<string | ArrayBuffer | Blob>;
		protocol: string;
		extensions: string;
	}

	interface WebSocketStreamClosedInfo {
		closeCode: number;
		reason: string;
	}

	interface WebSocketStream {
		readonly url: string;
		readonly opened: Promise<WebSocketStreamOpenedInfo>;
		readonly closed: Promise<WebSocketStreamClosedInfo>;
		close(info?: WebSocketStreamCloseInfo): void;
	}

	var WebSocketStream: {
		readonly prototype: WebSocketStream;
		new (url: string | URL, options?: WebSocketStreamOptions): WebSocketStream;
	};

	interface Window {
		WASM: string;
		REAL_WASM: Uint8Array;

		/**
		 * The scramjet client belonging to a window.
		 */
		[import("./symbols").SCRAMJETCLIENT]: import("./client").ScramjetClient;
	}

	interface Document {
		/**
		 * Should be the same as window.
		 */
		[import("./symbols").SCRAMJETCLIENT]: import("./client").ScramjetClient;
	}

	const dbg: {
	log: (message: string, ...args: any[]) => void;
	warn: (message: string, ...args: any[]) => void;
	error: (message: string, ...args: any[]) => void;
	debug: (message: string, ...args: any[]) => void;
	time: (meta: URLMeta, before: number, type: string) => void;
	};

// eslint-disable-next-line scramjet-core/no-globals
	type GlobalThis = typeof globalThis;
	type Self = Window & GlobalThis;
}

export {};
