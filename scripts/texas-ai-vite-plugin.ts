import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import type { Plugin } from 'vite';

interface TexasAIRequest {
    player?: number;
    phase?: string;
    hand?: unknown[];
    communityCards?: unknown[];
    pot?: number;
    callAmount?: number;
    minRaise?: number;
    chips?: number;
    opponentCount?: number;
    legalActions?: string[];
}

interface PendingRequest {
    resolve: (response: any) => void;
    timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 6000;

class TexasAIBridge {
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
        return this.send('status', undefined, 2500).catch(error => ({
            ok: true,
            available: false,
            error: error instanceof Error ? error.message : String(error),
            stderr: this.stderrTail,
        }));
    }

    action(payload: TexasAIRequest): Promise<any> {
        this.queue = this.queue.then(
            () => this.send('action', payload, DEFAULT_TIMEOUT_MS),
            () => this.send('action', payload, DEFAULT_TIMEOUT_MS),
        );
        return this.queue;
    }

    dispose() {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timeout);
            pending.resolve({ ok: false, error: 'Texas AI bridge disposed' });
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
                resolve({ ok: false, error: `Texas AI ${command} timed out`, stderr: this.stderrTail });
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
                pending.resolve({ ok: false, error: 'Texas AI bridge exited', stderr: this.stderrTail });
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

function readJsonBody(req: import('node:http').IncomingMessage): Promise<TexasAIRequest> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 128_000) {
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
    if (process.env.TEXAS_AI_PYTHON) {
        return { command: process.env.TEXAS_AI_PYTHON, args: [] };
    }
    return process.platform === 'win32' ? { command: 'py', args: ['-3'] } : { command: 'python3', args: [] };
}

function isValidRequest(body: TexasAIRequest): boolean {
    return (
        Number.isInteger(body.player) &&
        typeof body.phase === 'string' &&
        Array.isArray(body.hand) &&
        Array.isArray(body.communityCards) &&
        Array.isArray(body.legalActions) &&
        typeof body.pot === 'number' &&
        typeof body.callAmount === 'number' &&
        typeof body.chips === 'number'
    );
}

function attachTexasAIApi(
    root: string,
    middlewares: { use: (path: string, handler: import('node:http').RequestListener) => void },
) {
    const scriptPath = path.resolve(root, 'scripts', 'texas_ai_bridge.py');
    const python = getPythonLaunch();
    const bridge = new TexasAIBridge(python.command, python.args, scriptPath);

    middlewares.use('/api/texas-ai/status', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        const status = await bridge.status();
        res.end(
            JSON.stringify({
                ...status,
                python,
                scriptPath,
            }),
        );
    });

    middlewares.use('/api/texas-ai/action', async (req, res) => {
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
                res.end(JSON.stringify({ ok: false, error: 'Missing or invalid Texas AI request' }));
                return;
            }

            const result = await bridge.action(body);
            if (!result.ok) {
                res.statusCode = 503;
            }
            res.end(JSON.stringify(result));
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        }
    });

    return () => bridge.dispose();
}

export function texasAIPlugin(): Plugin {
    let root = process.cwd();

    return {
        name: 'gamehall-texas-ai',
        configResolved(config) {
            root = config.root;
        },
        configureServer(server) {
            const dispose = attachTexasAIApi(root, server.middlewares);
            server.httpServer?.once('close', dispose);
        },
        configurePreviewServer(server) {
            return () => {
                const dispose = attachTexasAIApi(root, server.middlewares);
                server.httpServer?.once('close', dispose);
            };
        },
    };
}
