<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Expand, FolderOpen, Play, Upload } from 'lucide-vue-next';
import { gbaGames, loadGbaGame, type GbaGame } from '@/data/gbaGames';

declare global {
    interface Window {
        EJS_player?: string;
        EJS_core?: string;
        EJS_gameName?: string;
        EJS_gameUrl?: string;
        EJS_pathtodata?: string;
        EJS_startOnLoaded?: boolean;
        EJS_fullscreenOnLoaded?: boolean;
        EJS_DEBUG_XX?: boolean;
        EJS_emulator?: {
            callEvent?: (eventName: string) => void;
            stop?: () => void;
            destroy?: () => void;
            pause?: () => void;
            exit?: () => void;
            gameManager?: {
                toggleMainLoop?: (playing: number) => void;
            };
        };
    }
}

const route = useRoute();
const router = useRouter();
const selectedGame = ref<GbaGame>(gbaGames[0]);
const game = computed(() => selectedGame.value);
const playerRef = ref<HTMLElement | null>(null);
const shellRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const statusText = ref('准备加载');
const errorText = ref('');
const selectedFileName = ref('');
const isLoading = ref(false);
const hasStarted = ref(false);
const localObjectUrl = ref('');

const title = computed(() => selectedFileName.value || game.value.name);
const canLoadBundledRom = computed(() => Boolean(game.value.romPath));
const keyGroups = [
    { action: '方向', keys: ['↑', '↓', '←', '→'] },
    { action: 'A', keys: ['X'] },
    { action: 'B', keys: ['Z'] },
    { action: 'L', keys: ['A'] },
    { action: 'R', keys: ['S'] },
    { action: '开始', keys: ['Enter'] },
    { action: '选择', keys: ['Shift'] },
];

function shutdownEmulator() {
    const emulator = window.EJS_emulator;
    if (!emulator) return;

    try {
        emulator.gameManager?.toggleMainLoop?.(0);
        emulator.pause?.();
        emulator.callEvent?.('exit');
        emulator.stop?.();
        emulator.exit?.();
        emulator.destroy?.();
    } catch (error) {
        console.warn('EmulatorJS shutdown failed', error);
    }
}

function clearEmulatorGlobals() {
    delete window.EJS_player;
    delete window.EJS_core;
    delete window.EJS_gameName;
    delete window.EJS_gameUrl;
    delete window.EJS_pathtodata;
    delete window.EJS_startOnLoaded;
    delete window.EJS_fullscreenOnLoaded;
    delete window.EJS_DEBUG_XX;
    delete window.EJS_emulator;
}

function revokeLocalObjectUrl() {
    if (localObjectUrl.value) {
        URL.revokeObjectURL(localObjectUrl.value);
        localObjectUrl.value = '';
    }
}

function resetPlayer() {
    shutdownEmulator();
    clearEmulatorGlobals();
    const oldScript = document.querySelector('script[data-gamehall-emulatorjs="gba"]');
    oldScript?.remove();
    if (playerRef.value) {
        playerRef.value.innerHTML = '';
        const mount = document.createElement('div');
        mount.id = 'gba-emulator-player';
        mount.className = 'emulator-mount';
        playerRef.value.appendChild(mount);
    }
}

function goBackToLibrary() {
    shutdownEmulator();
    router.push('/gba');
}

async function startEmulator(gameUrl: string, label: string) {
    if (isLoading.value) return;

    try {
        isLoading.value = true;
        errorText.value = '';
        statusText.value = `正在加载 ${label}`;
        resetPlayer();
        await nextTick();

        window.EJS_player = '#gba-emulator-player';
        window.EJS_core = 'gba';
        window.EJS_gameName = label;
        window.EJS_gameUrl = gameUrl;
        window.EJS_pathtodata = '/emulatorjs/data/';
        window.EJS_startOnLoaded = true;
        window.EJS_fullscreenOnLoaded = false;
        window.EJS_DEBUG_XX = true;

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/emulatorjs/data/loader.js';
            script.dataset.gamehallEmulatorjs = 'gba';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('EmulatorJS 加载失败，请确认 public/emulatorjs/data 已生成。'));
            document.body.appendChild(script);
        });

        hasStarted.value = true;
        statusText.value = `正在运行 ${label}`;
    } catch (error) {
        errorText.value = error instanceof Error ? error.message : '模拟器加载失败';
        statusText.value = '加载失败';
    } finally {
        isLoading.value = false;
    }
}

async function loadBundledRom() {
    if (!game.value.romPath) {
        statusText.value = '请选择本地 ROM';
        return;
    }

    revokeLocalObjectUrl();
    selectedFileName.value = '';
    await startEmulator(game.value.romPath, game.value.fileName || game.value.name);
}

async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    revokeLocalObjectUrl();
    localObjectUrl.value = URL.createObjectURL(file);
    selectedFileName.value = file.name;
    await startEmulator(localObjectUrl.value, file.name);
    input.value = '';
}

async function enterFullscreen() {
    await shellRef.value?.requestFullscreen();
}

onMounted(async () => {
    selectedGame.value = await loadGbaGame(route.params.id);
    resetPlayer();
    statusText.value = game.value.romPath ? '点击开始游戏读取卡带' : '请选择本地 ROM';
});

onBeforeUnmount(() => {
    resetPlayer();
    revokeLocalObjectUrl();
});
</script>

<template>
    <div class="min-h-screen bg-[#0f1218] text-white">
        <main class="mx-auto flex min-h-screen w-full max-w-[1260px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
            <header
                class="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between"
            >
                <div>
                    <button
                        class="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                        @click="goBackToLibrary"
                    >
                        <ArrowLeft class="h-4 w-4" />
                        返回 GBA 列表
                    </button>
                    <h1 class="mt-3 text-2xl font-bold tracking-normal text-white sm:text-3xl">{{ title }}</h1>
                    <p class="mt-1 text-sm leading-6 text-slate-400">{{ game.desc }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button
                        v-if="canLoadBundledRom"
                        class="tool-button primary"
                        :disabled="isLoading"
                        @click="loadBundledRom"
                    >
                        <Play class="h-4 w-4" />
                        {{ isLoading ? '加载中' : hasStarted ? '重新开始' : '开始游戏' }}
                    </button>
                    <button class="tool-button" @click="fileInputRef?.click()">
                        <Upload class="h-4 w-4" />
                        导入 ROM
                    </button>
                    <button class="icon-button" :disabled="!hasStarted" title="全屏" @click="enterFullscreen">
                        <Expand class="h-4 w-4" />
                    </button>
                </div>
            </header>

            <section ref="shellRef" class="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_292px]">
                <div class="screen-shell">
                    <div ref="playerRef" class="screen-mount" />
                    <div v-if="!hasStarted && !isLoading" class="empty-state">
                        <FolderOpen class="h-10 w-10 text-violet-200" />
                        <p class="mt-3 text-lg font-semibold text-white">等待卡带</p>
                        <p class="mt-1 max-w-sm text-center text-sm leading-6 text-slate-400">
                            使用 EmulatorJS / libretro GBA 核心运行，兼容性比旧 gbajs 核心更完整。
                        </p>
                        <div class="mt-4 flex flex-wrap justify-center gap-2">
                            <button v-if="canLoadBundledRom" class="tool-button primary" @click="loadBundledRom">
                                开始游戏
                            </button>
                            <button class="tool-button" @click="fileInputRef?.click()">选择 ROM</button>
                        </div>
                    </div>
                </div>

                <aside class="side-panel">
                    <div>
                        <p class="panel-label">状态</p>
                        <p class="mt-1 text-sm leading-6 text-slate-200">{{ statusText }}</p>
                        <p
                            v-if="errorText"
                            class="mt-2 rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-sm leading-6 text-red-100"
                        >
                            {{ errorText }}
                        </p>
                    </div>

                    <div class="divider" />

                    <div>
                        <p class="panel-label">核心</p>
                        <p class="mt-2 text-sm leading-6 text-slate-300">
                            EmulatorJS GBA，优先使用 libretro/mGBA 类核心。
                        </p>
                    </div>

                    <div class="divider" />

                    <div>
                        <p class="panel-label">键位</p>
                        <div class="mt-3 grid gap-2">
                            <div v-for="group in keyGroups" :key="group.action" class="key-row">
                                <span class="key-action">{{ group.action }}</span>
                                <span class="key-list">
                                    <kbd v-for="key in group.keys" :key="key" class="keycap">{{ key }}</kbd>
                                </span>
                            </div>
                        </div>
                    </div>

                    <div class="divider" />

                    <div>
                        <p class="panel-label">ROM 路径</p>
                        <p
                            class="mt-2 break-all rounded-md bg-black/20 px-3 py-2 font-mono text-xs leading-5 text-slate-300"
                        >
                            {{ game.romPath || '本地临时导入' }}
                        </p>
                    </div>
                </aside>
            </section>

            <input
                ref="fileInputRef"
                class="hidden"
                type="file"
                accept=".gba,application/octet-stream"
                @change="handleFileChange"
            />
        </main>
    </div>
</template>

<style scoped>
.tool-button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.07);
    padding: 0 12px;
    font-size: 14px;
    color: rgb(226, 232, 240);
    transition:
        background 0.2s ease,
        border-color 0.2s ease,
        color 0.2s ease;
}

.tool-button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.12);
    color: white;
}

.tool-button:disabled,
.icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

.tool-button.primary {
    border-color: rgba(167, 139, 250, 0.32);
    background: rgba(167, 139, 250, 0.17);
    color: rgb(237, 233, 254);
}

.icon-button {
    display: grid;
    min-height: 38px;
    width: 38px;
    place-items: center;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.07);
    color: rgb(226, 232, 240);
    transition:
        background 0.2s ease,
        border-color 0.2s ease,
        color 0.2s ease;
}

.icon-button:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.12);
    color: white;
}

.screen-shell {
    position: relative;
    min-height: 360px;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 36%),
        radial-gradient(circle at 50% 10%, rgba(167, 139, 250, 0.13), transparent 32%), #05070b;
}

.screen-mount {
    display: grid;
    height: min(72vh, 720px);
    min-height: 360px;
    place-items: center;
    padding: 0;
}

.screen-mount :deep(.emulator-mount),
.screen-mount :deep(#gba-emulator-player) {
    width: 100%;
    height: 100%;
    min-height: 360px;
}

.empty-state {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    align-content: center;
    padding: 24px;
    background: rgba(5, 7, 11, 0.78);
}

.side-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.055);
    padding: 16px;
}

.panel-label {
    font-size: 12px;
    font-weight: 600;
    color: rgb(148, 163, 184);
}

.key-row {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
}

.key-action {
    font-size: 13px;
    color: rgb(203, 213, 225);
}

.key-list {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    gap: 6px;
}

.keycap {
    display: inline-grid;
    min-width: 28px;
    min-height: 26px;
    place-items: center;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.32);
    background: rgba(15, 23, 42, 0.76);
    padding: 0 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 12px;
    font-weight: 700;
    color: rgb(226, 232, 240);
    box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.24);
}

.divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
}
</style>
