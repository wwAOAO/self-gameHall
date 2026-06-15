import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
    UNO_PLAYER_COUNT,
    applyUnoAction,
    createInitialUnoState,
    type PlayerId,
    type UnoAction,
    type UnoSnapshot,
} from '../src/lib/unoGame';

interface UnoRoom {
    id: string;
    players: Set<PlayerId>;
    state: UnoSnapshot;
    version: number;
    touchedAt: number;
}

const rooms = new Map<string, UnoRoom>();
const ROOM_TTL = 1000 * 60 * 60 * 6;

function readBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => {
            raw += chunk;
            if (raw.length > 1024 * 1024) {
                reject(new Error('Request body too large'));
                req.destroy();
            }
        });
        req.on('end', () => {
            if (!raw) resolve({});
            else {
                try {
                    resolve(JSON.parse(raw));
                } catch {
                    reject(new Error('Invalid JSON'));
                }
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}

function makeRoomId(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 4; i++) {
        id += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return rooms.has(id) ? makeRoomId() : id;
}

function cleanupRooms() {
    const now = Date.now();
    for (const [id, room] of rooms) {
        if (now - room.touchedAt > ROOM_TTL) rooms.delete(id);
    }
}

function isPlayerId(value: unknown): value is PlayerId {
    return value === 0 || value === 1 || value === 2 || value === 3;
}

function nextOpenSeat(room: UnoRoom): PlayerId | null {
    for (let id = 0; id < UNO_PLAYER_COUNT; id++) {
        const playerId = id as PlayerId;
        if (!room.players.has(playerId)) return playerId;
    }
    return null;
}

function roomPayload(room: UnoRoom, playerId: PlayerId) {
    room.touchedAt = Date.now();
    return {
        roomId: room.id,
        playerId,
        playerCount: room.players.size,
        version: room.version,
        state: room.state,
    };
}

function getRoom(roomId: string): UnoRoom {
    const room = rooms.get(roomId.toUpperCase());
    if (!room) throw new Error('房间不存在，请让房主重新创建。');
    return room;
}

export function unoLanPlugin(): Plugin {
    return {
        name: 'uno-lan-api',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const url = new URL(req.url || '/', 'http://localhost');
                if (!url.pathname.startsWith('/uno-api/')) {
                    next();
                    return;
                }

                try {
                    cleanupRooms();

                    if (url.pathname === '/uno-api/create' && req.method === 'POST') {
                        const id = makeRoomId();
                        const room: UnoRoom = {
                            id,
                            players: new Set([0]),
                            state: createInitialUnoState(),
                            version: 1,
                            touchedAt: Date.now(),
                        };
                        room.state.message = `房间 ${id} 已创建，等待其他玩家。`;
                        rooms.set(id, room);
                        sendJson(res, 200, roomPayload(room, 0));
                        return;
                    }

                    if (url.pathname === '/uno-api/join' && req.method === 'POST') {
                        const body = await readBody(req);
                        const room = getRoom(String(body.roomId || ''));
                        if (room.state.phase !== 'lobby') throw new Error('牌局已经开始，不能加入。');
                        const playerId = nextOpenSeat(room);
                        if (playerId === null) throw new Error('房间已经满员。');
                        room.players.add(playerId);
                        room.version++;
                        room.state.message =
                            room.players.size >= UNO_PLAYER_COUNT
                                ? '4 名玩家已到齐，房主可以开始牌局。'
                                : `玩家 ${playerId + 1} 已加入，等待 ${UNO_PLAYER_COUNT - room.players.size} 名玩家。`;
                        sendJson(res, 200, roomPayload(room, playerId));
                        return;
                    }

                    if (url.pathname === '/uno-api/state' && req.method === 'GET') {
                        const room = getRoom(String(url.searchParams.get('roomId') || ''));
                        const rawPlayerId = Number(url.searchParams.get('playerId') || 0);
                        const playerId: PlayerId = isPlayerId(rawPlayerId) ? rawPlayerId : 0;
                        sendJson(res, 200, roomPayload(room, playerId));
                        return;
                    }

                    if (url.pathname === '/uno-api/action' && req.method === 'POST') {
                        const body = await readBody(req);
                        const room = getRoom(String(body.roomId || ''));
                        const playerId = body.playerId;
                        const action = body.action as UnoAction | undefined;
                        if (!isPlayerId(playerId) || !room.players.has(playerId)) {
                            throw new Error('你不在这个房间里。');
                        }
                        if (!action) throw new Error('缺少操作。');
                        if ((action.type === 'start' || action.type === 'restart') && playerId !== 0) {
                            throw new Error('只有房主可以开始或重开。');
                        }
                        if (
                            (action.type === 'start' || action.type === 'restart') &&
                            room.players.size < UNO_PLAYER_COUNT
                        ) {
                            throw new Error(`等待 ${UNO_PLAYER_COUNT - room.players.size} 名玩家加入。`);
                        }
                        if ('player' in action && action.player !== playerId) {
                            throw new Error('玩家身份不匹配。');
                        }
                        room.state = applyUnoAction(room.state, action);
                        room.version++;
                        sendJson(res, 200, roomPayload(room, playerId));
                        return;
                    }

                    sendJson(res, 404, { error: 'Unknown UNO API route' });
                } catch (reason) {
                    sendJson(res, 400, { error: reason instanceof Error ? reason.message : 'UNO API error' });
                }
            });
        },
    };
}
