import { computed, onBeforeUnmount, ref } from 'vue';
import {
    CHINESE_CHESS_PLAYER_COUNT,
    playerSide,
    type ChineseChessAction,
    type ChineseChessPlayerId,
    type ChineseChessSnapshot,
    createInitialChineseChessState,
} from '@/lib/chineseChessLanGame';

type PeerRole = 'host' | 'guest';
type ConnStatus = 'idle' | 'waiting' | 'connected' | 'error';

interface RoomPayload {
    roomId: string;
    playerId: ChineseChessPlayerId;
    playerCount: number;
    version: number;
    state: ChineseChessSnapshot;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || requestErrorMessage(response.status));
    return payload;
}

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || requestErrorMessage(response.status));
    return payload;
}

function requestErrorMessage(status: number): string {
    if (status === 404) return '局域网接口未加载，请重启开发服务后再试。';
    return `请求失败（${status}）`;
}

export function useChineseChessLan() {
    const role = ref<PeerRole | null>(null);
    const localPlayer = ref<ChineseChessPlayerId>(0);
    const connectionStatus = ref<ConnStatus>('idle');
    const roomId = ref('');
    const joinRoomId = ref('');
    const copied = ref(false);
    const error = ref('');
    const state = ref<ChineseChessSnapshot>(createInitialChineseChessState());
    const playerCount = ref(0);
    const version = ref(0);

    let pollTimer: number | null = null;

    const isHost = computed(() => role.value === 'host');
    const mySide = computed(() => playerSide(localPlayer.value));
    const myLabel = computed(() => (mySide.value === 'red' ? '红方' : '黑方'));
    const opponentLabel = computed(() => (mySide.value === 'red' ? '黑方' : '红方'));
    const isMyTurn = computed(() => state.value.phase === 'playing' && state.value.currentSide === mySide.value);
    const canStart = computed(() => isHost.value && connectionStatus.value === 'connected' && playerCount.value >= CHINESE_CHESS_PLAYER_COUNT);

    function applyRoom(payload: RoomPayload) {
        roomId.value = payload.roomId;
        localPlayer.value = payload.playerId;
        playerCount.value = payload.playerCount;
        version.value = payload.version;
        state.value = payload.state;
        connectionStatus.value = payload.playerCount >= CHINESE_CHESS_PLAYER_COUNT ? 'connected' : 'waiting';
        error.value = '';
    }

    function stopPolling() {
        if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startPolling() {
        stopPolling();
        pollTimer = window.setInterval(refreshRoom, 500);
    }

    async function refreshRoom() {
        if (!roomId.value) return;
        try {
            const payload = await getJson<RoomPayload>(
                `/chinese-chess-api/state?roomId=${encodeURIComponent(roomId.value)}&playerId=${localPlayer.value}`,
            );
            applyRoom(payload);
        } catch (reason) {
            connectionStatus.value = 'error';
            error.value = reason instanceof Error ? reason.message : '房间同步失败';
            stopPolling();
        }
    }

    async function createRoom() {
        stopPolling();
        try {
            const payload = await postJson<RoomPayload>('/chinese-chess-api/create', {});
            role.value = 'host';
            joinRoomId.value = '';
            applyRoom(payload);
            startPolling();
        } catch (reason) {
            connectionStatus.value = 'error';
            error.value = reason instanceof Error ? reason.message : '创建房间失败';
        }
    }

    async function joinRoom() {
        stopPolling();
        const code = joinRoomId.value.trim().toUpperCase();
        if (!code) return;
        try {
            const payload = await postJson<RoomPayload>('/chinese-chess-api/join', { roomId: code });
            role.value = 'guest';
            applyRoom(payload);
            startPolling();
        } catch (reason) {
            connectionStatus.value = 'error';
            error.value = reason instanceof Error ? reason.message : '加入房间失败';
        }
    }

    async function commitAction(action: ChineseChessAction) {
        if (!roomId.value) return;
        try {
            const payload = await postJson<RoomPayload>('/chinese-chess-api/action', {
                roomId: roomId.value,
                playerId: localPlayer.value,
                action,
            });
            applyRoom(payload);
        } catch (reason) {
            error.value = reason instanceof Error ? reason.message : '操作失败';
        }
    }

    function startGame() {
        commitAction({ type: 'start' });
    }

    function restartGame() {
        commitAction({ type: 'restart' });
    }

    function movePiece(fromRow: number, fromCol: number, toRow: number, toCol: number) {
        commitAction({ type: 'move', player: localPlayer.value, fromRow, fromCol, toRow, toCol });
    }

    async function copyRoomId() {
        if (!roomId.value) return;
        try {
            await navigator.clipboard?.writeText(roomId.value);
            copied.value = true;
            window.setTimeout(() => (copied.value = false), 1200);
        } catch {
            error.value = `复制失败，请手动记下房间号：${roomId.value}`;
        }
    }

    onBeforeUnmount(stopPolling);

    return {
        role,
        localPlayer,
        connectionStatus,
        roomId,
        joinRoomId,
        copied,
        error,
        state,
        playerCount,
        version,
        isHost,
        isMyTurn,
        mySide,
        myLabel,
        opponentLabel,
        canStart,
        playerLimit: CHINESE_CHESS_PLAYER_COUNT,
        createRoom,
        joinRoom,
        copyRoomId,
        startGame,
        restartGame,
        movePiece,
        stopPolling,
    };
}
