import { computed, onBeforeUnmount, ref } from 'vue';
import {
    FIGHT_PLAYER_COUNT,
    applyFightAction,
    createInitialFightState,
    fightCardLabel,
    findFightHints,
    type FightAction,
    type FightBidValue,
    type FightCard,
    type FightPlayerId,
    type FightSnapshot,
} from '@/lib/fightLandlordLanGame';

type PeerRole = 'host' | 'guest';
type ConnStatus = 'idle' | 'waiting' | 'connected' | 'closed' | 'error';

interface RoomPayload {
    roomId: string;
    playerId: FightPlayerId;
    playerCount: number;
    version: number;
    state: FightSnapshot;
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

export function useFightLandlordLan() {
    const role = ref<PeerRole | null>(null);
    const localPlayer = ref<FightPlayerId>(0);
    const connectionStatus = ref<ConnStatus>('idle');
    const roomId = ref('');
    const joinRoomId = ref('');
    const copied = ref(false);
    const error = ref('');
    const state = ref<FightSnapshot>(createInitialFightState());
    const playerCount = ref(0);
    const version = ref(0);
    const selectedCardIds = ref<string[]>([]);

    let pollTimer: number | null = null;

    const me = computed(() => state.value.players[localPlayer.value]);
    const opponents = computed(() =>
        state.value.players
            .map((player, id) => ({ id: id as FightPlayerId, player }))
            .filter(seat => seat.id !== localPlayer.value),
    );
    const isHost = computed(() => role.value === 'host');
    const isMyTurn = computed(() => state.value.phase === 'playing' && state.value.currentPlayer === localPlayer.value);
    const isMyBidTurn = computed(() => state.value.phase === 'bidding' && state.value.bidder === localPlayer.value);
    const canStart = computed(() => isHost.value && connectionStatus.value === 'connected' && playerCount.value >= FIGHT_PLAYER_COUNT);
    const canBid = computed(() => isMyBidTurn.value);
    const canPass = computed(() => state.value.phase === 'playing' && isMyTurn.value && !!state.value.lastPlay && state.value.lastPlayPlayer !== localPlayer.value);
    const legalHints = computed(() => findFightHints(me.value.hand, state.value.lastPlay?.hand || null));
    const selectedCards = computed(() =>
        me.value.hand.filter(card => selectedCardIds.value.includes(card.id)),
    );

    function applyRoom(payload: RoomPayload) {
        roomId.value = payload.roomId;
        localPlayer.value = payload.playerId;
        playerCount.value = payload.playerCount;
        version.value = payload.version;
        state.value = payload.state;
        connectionStatus.value = payload.playerCount >= 2 ? 'connected' : 'waiting';
        selectedCardIds.value = selectedCardIds.value.filter(id => payload.state.players[payload.playerId].hand.some(card => card.id === id));
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
                `/fight-lan-api/state?roomId=${encodeURIComponent(roomId.value)}&playerId=${localPlayer.value}`,
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
            const payload = await postJson<RoomPayload>('/fight-lan-api/create', {});
            role.value = 'host';
            joinRoomId.value = '';
            selectedCardIds.value = [];
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
            const payload = await postJson<RoomPayload>('/fight-lan-api/join', { roomId: code });
            role.value = 'guest';
            selectedCardIds.value = [];
            applyRoom(payload);
            startPolling();
        } catch (reason) {
            connectionStatus.value = 'error';
            error.value = reason instanceof Error ? reason.message : '加入房间失败';
        }
    }

    async function commitAction(action: FightAction) {
        if (!roomId.value) return;
        try {
            const payload = await postJson<RoomPayload>('/fight-lan-api/action', {
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

    function bid(value: FightBidValue | 'pass') {
        commitAction({ type: 'bid', player: localPlayer.value, bid: value });
    }

    function toggleCard(card: FightCard) {
        if (!isMyTurn.value) return;
        const idx = selectedCardIds.value.indexOf(card.id);
        if (idx >= 0) selectedCardIds.value.splice(idx, 1);
        else selectedCardIds.value.push(card.id);
    }

    function clearSelection() {
        selectedCardIds.value = [];
    }

    function playSelected() {
        commitAction({ type: 'play', player: localPlayer.value, cardIds: [...selectedCardIds.value] });
    }

    function passTurn() {
        commitAction({ type: 'pass', player: localPlayer.value });
    }

    function isHintCard(card: FightCard): boolean {
        return legalHints.value.some(hand => hand.cards.some(item => item.id === card.id));
    }

    function isPlayable(card: FightCard): boolean {
        if (!isMyTurn.value) return false;
        if (state.value.phase !== 'playing') return false;
        const hand = state.value.lastPlay?.hand || null;
        return findFightHints(me.value.hand, hand).some(play => play.cards.some(item => item.id === card.id));
    }

    function bidOptions(): FightBidValue[] {
        const current = state.value.currentBid;
        return [1, 2, 3].filter(value => value > current) as FightBidValue[];
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
        me,
        opponents,
        isHost,
        isMyTurn,
        isMyBidTurn,
        canStart,
        canBid,
        canPass,
        selectedCardIds,
        selectedCards,
        legalHints,
        createRoom,
        joinRoom,
        copyRoomId,
        startGame,
        restartGame,
        bid,
        playSelected,
        passTurn,
        toggleCard,
        clearSelection,
        isHintCard,
        isPlayable,
        bidOptions,
        cardLabel: fightCardLabel,
    };
}
