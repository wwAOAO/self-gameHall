import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface DouZeroRequest {
    player?: number;
    position?: 'landlord' | 'landlord_up' | 'landlord_down';
    playerPositions?: Record<string, 'landlord' | 'landlord_up' | 'landlord_down'>;
    hands?: number[][];
    landlordCards?: number[];
    history?: { player: number; position: string; values: number[] }[];
    legalActions?: number[][];
    bombCount?: number;
}

interface PendingRequest {
    resolve: (response: any) => void;
    timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 15000;

class DouZeroBridge {
    private process: ChildProcessWithoutNullStreams | null = null;
    private stdoutBuffer = '';
    private stderrTail = '';
    private pending = new Map<number, PendingRequest>();
    private nextId = 1;
    private queue: Promise<any> = Promise.resolve(null);

    constructor(
        private pythonCommand: string,
        private pythonArgs: string[],
        private scriptPath: string,
    ) {}

    status(): Promise<any> {
        return this.send('status', undefined, 2000).catch(error => ({
            ok: true,
            available: false,
            error: error instanceof Error ? error.message : String(error),
            stderr: this.stderrTail,
        }));
    }

    play(payload: DouZeroRequest, modelPaths: Record<string, string | null>): Promise<any> {
        this.queue = this.queue.then(
            () => this.send('play', { ...payload, modelPaths }, DEFAULT_TIMEOUT_MS),
            () => this.send('play', { ...payload, modelPaths }, DEFAULT_TIMEOUT_MS),
        );
        return this.queue;
    }

    dispose() {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timeout);
            pending.resolve({ ok: false, error: 'DouZero bridge disposed' });
        }
        this.pending.clear();
        this.process?.kill();
        this.process = null;
    }

    private send(command: string, payload: any, timeoutMs: number): Promise<any> {
        const process = this.ensureProcess();
        const id = this.nextId++;

        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                resolve({ ok: false, error: `DouZero ${command} timed out`, stderr: this.stderrTail });
            }, timeoutMs);

            this.pending.set(id, { resolve, timeout });
            process.stdin.write(`${JSON.stringify({ id, command, payload })}\n`);
        });
    }

    private ensureProcess(): ChildProcessWithoutNullStreams {
        if (this.process) return this.process;

        const child = spawn(this.pythonCommand, [...this.pythonArgs, this.scriptPath], {
            cwd: path.dirname(this.scriptPath),
            stdio: 'pipe',
            env: {
                ...process.env,
                PYTHONIOENCODING: 'utf-8',
            },
        });

        this.process = child;
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => this.handleStdout(chunk));
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => {
            this.stderrTail = `${this.stderrTail}${chunk}`.slice(-4000);
        });
        child.on('exit', () => {
            this.process = null;
            for (const pending of this.pending.values()) {
                clearTimeout(pending.timeout);
                pending.resolve({ ok: false, error: 'DouZero bridge exited', stderr: this.stderrTail });
            }
            this.pending.clear();
        });
        child.on('error', error => {
            this.process = null;
            for (const pending of this.pending.values()) {
                clearTimeout(pending.timeout);
                pending.resolve({ ok: false, error: error.message, stderr: this.stderrTail });
            }
            this.pending.clear();
        });

        return child;
    }

    private handleStdout(chunk: string) {
        this.stdoutBuffer += chunk;
        const lines = this.stdoutBuffer.split(/\r?\n/);
        this.stdoutBuffer = lines.pop() ?? '';

        for (const line of lines) {
            if (!line.trim()) continue;
            let message: any;
            try {
                message = JSON.parse(line);
            } catch {
                this.stderrTail = `${this.stderrTail}\n${line}`.slice(-4000);
                continue;
            }

            const pending = this.pending.get(message.id);
            if (!pending) continue;
            clearTimeout(pending.timeout);
            this.pending.delete(message.id);
            pending.resolve(message);
        }
    }
}

function readJsonBody(req: import('node:http').IncomingMessage): Promise<DouZeroRequest> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 256_000) {
                reject(new Error('Request body is too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

function getPythonLaunch(): { command: string; args: string[] } {
    if (process.env.DOUZERO_PYTHON) {
        return { command: process.env.DOUZERO_PYTHON, args: [] };
    }
    return process.platform === 'win32' ? { command: 'py', args: ['-3'] } : { command: 'python3', args: [] };
}

function findModelPaths(root: string): Record<string, string | null> {
    const baseDir = path.resolve(root, 'engines', 'douzero');
    const candidates: Record<string, (string | undefined)[]> = {
        landlord: [
            process.env.DOUZERO_LANDLORD_MODEL,
            path.resolve(baseDir, 'douzero_ADP', 'landlord.ckpt'),
            path.resolve(baseDir, 'douzero_WP', 'landlord.ckpt'),
            path.resolve(baseDir, 'baselines', 'douzero_ADP', 'landlord.ckpt'),
            path.resolve(baseDir, 'baselines', 'douzero_WP', 'landlord.ckpt'),
        ],
        landlord_up: [
            process.env.DOUZERO_LANDLORD_UP_MODEL,
            path.resolve(baseDir, 'douzero_ADP', 'landlord_up.ckpt'),
            path.resolve(baseDir, 'douzero_WP', 'landlord_up.ckpt'),
            path.resolve(baseDir, 'baselines', 'douzero_ADP', 'landlord_up.ckpt'),
            path.resolve(baseDir, 'baselines', 'douzero_WP', 'landlord_up.ckpt'),
        ],
        landlord_down: [
            process.env.DOUZERO_LANDLORD_DOWN_MODEL,
            path.resolve(baseDir, 'douzero_ADP', 'landlord_down.ckpt'),
            path.resolve(baseDir, 'douzero_WP', 'landlord_down.ckpt'),
            path.resolve(baseDir, 'baselines', 'douzero_ADP', 'landlord_down.ckpt'),
            path.resolve(baseDir, 'baselines', 'douzero_WP', 'landlord_down.ckpt'),
        ],
    };

    return Object.fromEntries(
        Object.entries(candidates).map(([position, paths]) => [
            position,
            paths.filter(Boolean).find(candidate => fs.existsSync(candidate!)) ?? null,
        ]),
    );
}

function isValidRequest(body: DouZeroRequest): boolean {
    return (
        Number.isInteger(body.player) &&
        !!body.position &&
        !!body.playerPositions &&
        Array.isArray(body.hands) &&
        body.hands.length === 3 &&
        Array.isArray(body.legalActions)
    );
}

function attachDouZeroApi(
    root: string,
    middlewares: { use: (path: string, handler: import('node:http').RequestListener) => void },
) {
    const scriptPath = path.resolve(root, 'scripts', 'douzero_bridge.py');
    const python = getPythonLaunch();
    const bridge = new DouZeroBridge(python.command, python.args, scriptPath);

    middlewares.use('/api/douzero/status', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const status = await bridge.status();
        const modelPaths = findModelPaths(root);
        res.end(
            JSON.stringify({
                ...status,
                python,
                scriptPath,
                modelPaths,
            }),
        );
    });

    middlewares.use('/api/douzero/play', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');

        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end(JSON.stringify({ ok: false, error: 'POST only' }));
            return;
        }

        try {
            const body = await readJsonBody(req);
            if (!isValidRequest(body)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Missing or invalid DouZero request' }));
                return;
            }

            const modelPaths = findModelPaths(root);
            const result = await bridge.play(body, modelPaths);
            if (!result.ok) {
                res.statusCode = 503;
            }
            res.end(JSON.stringify({ ...result, modelPaths }));
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
    });

    return () => bridge.dispose();
}

export function douzeroPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-douzero',
        configResolved(config) {
            root = config.root;
        },
        configureServer(server) {
            const dispose = attachDouZeroApi(root, server.middlewares);
            server.httpServer?.once('close', dispose);
        },
        configurePreviewServer(server) {
            return () => {
                const dispose = attachDouZeroApi(root, server.middlewares);
                server.httpServer?.once('close', dispose);
            };
        },
    };
}
