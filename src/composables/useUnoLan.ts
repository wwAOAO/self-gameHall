import { computed, onBeforeUnmount, ref } from 'vue';
import {
    UNO_COLORS,
    UNO_COLOR_LABELS,
    UNO_KIND_LABELS,
    UNO_PLAYER_COUNT,
    applyUnoAction,
    canPlayUnoCard,
    createInitialUnoState,
    unoCardLabel,
    type PlayerId,
    type UnoAction,
    type UnoCard,
    type UnoSnapshot,
} from '@/lib/unoGame';

type PeerRole = 'host' | 'guest';
type ConnStatus = 'idle' | 'waiting' | 'connected' | 'closed' | 'error';

interface RoomPayload {
    roomId: string;
    playerId: PlayerId;
    playerCount: number;
    version: number;
    state: UnoSnapshot;
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

export function useUnoLan() {
    const role = ref<PeerRole | null>(null);
    const localPlayer = ref<PlayerId>(0);
    const connectionStatus = ref<ConnStatus>('idle');
    const roomId = ref('');
    const joinRoomId = ref('');
    const copied = ref(false);
    const error = ref('');
    const selectedColor = ref<Exclude<UnoCard['color'], 'wild'>>('red');
    const state = ref<UnoSnapshot>(createInitialUnoState());
    const playerCount = ref(0);
    const version = ref(0);

    let pollTimer: number | null = null;

    const me = computed(() => state.value.players[localPlayer.value]);
    const opponents = computed(() => {
        return state.value.players
            .map((player, id) => ({ id: id as PlayerId, player }))
            .filter(seat => seat.id !== localPlayer.value);
    });
    const opponent = computed(() => opponents.value[0]?.player || state.value.players[0]);
    const topCard = computed(() => state.value.discard[state.value.discard.length - 1] || null);
    const activeColor = computed(() => state.value.pendingColor);
    const isMyTurn = computed(() => state.value.phase === 'playing' && state.value.currentPlayer === localPlayer.value);
    const isHost = computed(() => role.value === 'host');
    const canStart = computed(
        () => isHost.value && connectionStatus.value === 'connected' && playerCount.value >= UNO_PLAYER_COUNT,
    );
    const canDraw = computed(() => isMyTurn.value && !state.value.drawnCardId);
    const canKeep = computed(() => isMyTurn.value && !!state.value.drawnCardId);

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
                `/uno-api/state?roomId=${encodeURIComponent(roomId.value)}&playerId=${localPlayer.value}`,
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
            const payload = await postJson<RoomPayload>('/uno-api/create', {});
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
            const payload = await postJson<RoomPayload>('/uno-api/join', { roomId: code });
            role.value = 'guest';
            applyRoom(payload);
            startPolling();
        } catch (reason) {
            connectionStatus.value = 'error';
            error.value = reason instanceof Error ? reason.message : '加入房间失败';
        }
    }

    async function commitAction(action: UnoAction) {
        if (!roomId.value) return;
        try {
            const payload = await postJson<RoomPayload>('/uno-api/action', {
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

    function playCard(card: UnoCard) {
        commitAction({ type: 'play', player: localPlayer.value, cardId: card.id, color: selectedColor.value });
    }

    function drawOne() {
        commitAction({ type: 'draw', player: localPlayer.value });
    }

    function keepAfterDraw() {
        commitAction({ type: 'keep', player: localPlayer.value });
    }

    function isPlayable(card: UnoCard): boolean {
        if (!topCard.value || !isMyTurn.value) return false;
        if (state.value.drawnCardId && card.id !== state.value.drawnCardId) return false;
        return canPlayUnoCard(card, topCard.value, activeColor.value);
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
        selectedColor,
        state,
        playerCount,
        me,
        opponent,
        opponents,
        topCard,
        activeColor,
        isMyTurn,
        isHost,
        canStart,
        canDraw,
        canKeep,
        playerLimit: UNO_PLAYER_COUNT,
        colors: UNO_COLORS,
        colorLabels: UNO_COLOR_LABELS,
        kindLabels: UNO_KIND_LABELS,
        createRoom,
        joinRoom,
        copyRoomId,
        startGame,
        restartGame,
        playCard,
        drawOne,
        keepAfterDraw,
        isPlayable,
        cardLabel: unoCardLabel,
        previewState: applyUnoAction,
    };
}
