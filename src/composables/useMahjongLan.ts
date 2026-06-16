import { computed, onBeforeUnmount, ref } from 'vue';
import {
    MAHJONG_PLAYER_COUNT,
    applyMahjongAction,
    canMahjongWin,
    createInitialMahjongState,
    mahjongTileLabel,
    type MahjongAction,
    type MahjongPlayerId,
    type MahjongSnapshot,
    type MahjongTile,
} from '@/lib/mahjongLanGame';

type PeerRole = 'host' | 'guest';
type ConnStatus = 'idle' | 'waiting' | 'connected' | 'closed' | 'error';

interface RoomPayload {
    roomId: string;
    playerId: MahjongPlayerId;
    playerCount: number;
    version: number;
    state: MahjongSnapshot;
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

export function useMahjongLan() {
    const role = ref<PeerRole | null>(null);
    const localPlayer = ref<MahjongPlayerId>(0);
    const connectionStatus = ref<ConnStatus>('idle');
    const roomId = ref('');
    const joinRoomId = ref('');
    const copied = ref(false);
    const error = ref('');
    const state = ref<MahjongSnapshot>(createInitialMahjongState());
    const playerCount = ref(0);
    const version = ref(0);

    let pollTimer: number | null = null;

    const me = computed(() => state.value.players[localPlayer.value]);
    const opponents = computed(() =>
        state.value.players
            .map((player, id) => ({ id: id as MahjongPlayerId, player }))
            .filter(seat => seat.id !== localPlayer.value),
    );
    const isHost = computed(() => role.value === 'host');
    const isMyTurn = computed(() => state.value.phase === 'playing' && state.value.currentPlayer === localPlayer.value);
    const canStart = computed(
        () => isHost.value && connectionStatus.value === 'connected' && playerCount.value >= MAHJONG_PLAYER_COUNT,
    );
    const canClaimWin = computed(
        () => state.value.phase === 'claim' && state.value.claimPlayers.includes(localPlayer.value),
    );
    const canSelfWin = computed(() => isMyTurn.value && canMahjongWin(me.value.hand));

    function applyRoom(payload: RoomPayload) {
        roomId.value = payload.roomId;
        localPlayer.value = payload.playerId;
        playerCount.value = payload.playerCount;
        version.value = payload.version;
        state.value = payload.state;
        connectionStatus.value = payload.playerCount >= 2 ? 'connected' : 'waiting';
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
        pollTimer = window.setInterval(refreshRoom, 650);
    }

    async function refreshRoom() {
        if (!roomId.value) return;
        try {
            const payload = await getJson<RoomPayload>(
                `/mahjong-api/state?roomId=${encodeURIComponent(roomId.value)}&playerId=${localPlayer.value}`,
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
            const payload = await postJson<RoomPayload>('/mahjong-api/create', {});
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
            const payload = await postJson<RoomPayload>('/mahjong-api/join', { roomId: code });
            role.value = 'guest';
            applyRoom(payload);
            startPolling();
        } catch (reason) {
            connectionStatus.value = 'error';
            error.value = reason instanceof Error ? reason.message : '加入房间失败';
        }
    }

    async function commitAction(action: MahjongAction) {
        if (!roomId.value) return;
        try {
            const payload = await postJson<RoomPayload>('/mahjong-api/action', {
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

    function discard(tile: MahjongTile) {
        commitAction({ type: 'discard', player: localPlayer.value, tileId: tile.id });
    }

    function claimWin() {
        commitAction({ type: 'claimWin', player: localPlayer.value });
    }

    function passClaim() {
        commitAction({ type: 'passClaim', player: localPlayer.value });
    }

    async function copyRoomId() {
        if (!roomId.value) return;
        try {
            await navigator.clipboard?.writeText(roomId.value);
            copied.value = true;
            window.setTimeout(() => (copied.value = false), 1200);
        } catch {
            error.value = `复制失败，请手动记录房间号：${roomId.value}`;
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
        me,
        opponents,
        isHost,
        isMyTurn,
        canStart,
        canClaimWin,
        canSelfWin,
        playerLimit: MAHJONG_PLAYER_COUNT,
        createRoom,
        joinRoom,
        copyRoomId,
        startGame,
        restartGame,
        discard,
        claimWin,
        passClaim,
        tileLabel: mahjongTileLabel,
        previewState: applyMahjongAction,
    };
}
