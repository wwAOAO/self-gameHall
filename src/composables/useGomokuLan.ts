import { computed, onBeforeUnmount, ref } from 'vue';
import {
    GOMOKU_BOARD_SIZE,
    GOMOKU_PLAYER_COUNT,
    createInitialGomokuState,
    playerStone,
    type GomokuAction,
    type GomokuPlayerId,
    type GomokuSnapshot,
} from '@/lib/gomokuLanGame';

type PeerRole = 'host' | 'guest';
type ConnStatus = 'idle' | 'waiting' | 'connected' | 'error';

interface RoomPayload {
    roomId: string;
    playerId: GomokuPlayerId;
    playerCount: number;
    version: number;
    state: GomokuSnapshot;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '请求失败');
    return payload;
}

async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '请求失败');
    return payload;
}

export function useGomokuLan() {
    const role = ref<PeerRole | null>(null);
    const localPlayer = ref<GomokuPlayerId>(0);
    const connectionStatus = ref<ConnStatus>('idle');
    const roomId = ref('');
    const joinRoomId = ref('');
    const copied = ref(false);
    const error = ref('');
    const state = ref<GomokuSnapshot>(createInitialGomokuState());
    const playerCount = ref(0);
    const version = ref(0);

    let pollTimer: number | null = null;

    const isHost = computed(() => role.value === 'host');
    const myStone = computed(() => playerStone(localPlayer.value));
    const myLabel = computed(() => (localPlayer.value === 0 ? '黑棋' : '白棋'));
    const opponentLabel = computed(() => (localPlayer.value === 0 ? '白棋' : '黑棋'));
    const isMyTurn = computed(() => state.value.phase === 'playing' && state.value.currentPlayer === myStone.value);
    const canStart = computed(
        () => isHost.value && connectionStatus.value === 'connected' && playerCount.value >= GOMOKU_PLAYER_COUNT,
    );

    function applyRoom(payload: RoomPayload) {
        roomId.value = payload.roomId;
        localPlayer.value = payload.playerId;
        playerCount.value = payload.playerCount;
        version.value = payload.version;
        state.value = payload.state;
        connectionStatus.value = payload.playerCount >= GOMOKU_PLAYER_COUNT ? 'connected' : 'waiting';
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
                `/gomoku-api/state?roomId=${encodeURIComponent(roomId.value)}&playerId=${localPlayer.value}`,
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
            const payload = await postJson<RoomPayload>('/gomoku-api/create', {});
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
            const payload = await postJson<RoomPayload>('/gomoku-api/join', { roomId: code });
            role.value = 'guest';
            applyRoom(payload);
            startPolling();
        } catch (reason) {
            connectionStatus.value = 'error';
            error.value = reason instanceof Error ? reason.message : '加入房间失败';
        }
    }

    async function commitAction(action: GomokuAction) {
        if (!roomId.value) return;
        try {
            const payload = await postJson<RoomPayload>('/gomoku-api/action', {
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

    function placeStone(row: number, col: number) {
        commitAction({ type: 'place', player: localPlayer.value, row, col });
    }

    async function copyRoomId() {
        if (!roomId.value) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(roomId.value);
            } else {
                const input = document.createElement('textarea');
                input.value = roomId.value;
                input.setAttribute('readonly', 'true');
                input.style.position = 'fixed';
                input.style.left = '-9999px';
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
            }
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
        isHost,
        isMyTurn,
        myStone,
        myLabel,
        opponentLabel,
        canStart,
        boardSize: GOMOKU_BOARD_SIZE,
        playerLimit: GOMOKU_PLAYER_COUNT,
        createRoom,
        joinRoom,
        copyRoomId,
        startGame,
        restartGame,
        placeStone,
        stopPolling,
    };
}
