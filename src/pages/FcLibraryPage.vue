<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, FolderOpen, Gamepad2, Play, Search, ShieldCheck, X } from 'lucide-vue-next';
import { fcGames as configuredFcGames, loadFcGames, type FcGame } from '@/data/fcGames';

const router = useRouter();
const games = ref<FcGame[]>(configuredFcGames);
const searchText = ref('');

const readyCount = computed(() => games.value.filter(game => game.romPath).length);
const normalizedSearch = computed(() => searchText.value.trim().toLocaleLowerCase());
const filteredGames = computed(() => {
    const keyword = normalizedSearch.value;
    if (!keyword) return games.value;

    return games.value.filter(game => {
        const searchableText = [game.name, game.desc, game.tag, game.mapper, game.romPath ?? '']
            .join(' ')
            .toLocaleLowerCase();

        return searchableText.includes(keyword);
    });
});

onMounted(async () => {
    games.value = await loadFcGames();
});
</script>

<template>
    <div class="min-h-screen bg-[#10131a] text-white">
        <main class="mx-auto flex min-h-screen w-full max-w-[1180px] flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
            <header
                class="flex flex-col gap-5 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between"
            >
                <div>
                    <button
                        class="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white"
                        @click="router.push('/')"
                    >
                        <ArrowLeft class="h-4 w-4" />
                        返回大厅
                    </button>
                    <div class="mt-5 flex items-center gap-3">
                        <div
                            class="grid h-12 w-12 place-items-center rounded-lg bg-cyan-400/12 text-cyan-100 ring-1 ring-cyan-300/20"
                        >
                            <Gamepad2 class="h-7 w-7" />
                        </div>
                        <div>
                            <h1 class="text-2xl font-bold tracking-normal sm:text-3xl">FC 游戏</h1>
                            <p class="mt-1 text-sm leading-6 text-slate-400">
                                加载 iNES 格式 ROM，支持键盘、手柄、暂停和即时存档。
                            </p>
                        </div>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-right text-sm">
                    <div class="rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3">
                        <p class="text-slate-500">卡带位</p>
                        <strong class="mt-1 block text-lg text-white">{{ games.length }}</strong>
                    </div>
                    <div class="rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3">
                        <p class="text-slate-500">固定 ROM</p>
                        <strong class="mt-1 block text-lg text-amber-200">{{ readyCount }}</strong>
                    </div>
                </div>
            </header>

            <section
                class="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.055] p-3 sm:flex-row sm:items-center sm:justify-between"
            >
                <label class="relative block w-full sm:max-w-md">
                    <Search
                        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    />
                    <input
                        v-model="searchText"
                        class="h-11 w-full rounded-md border border-white/10 bg-black/20 pl-10 pr-10 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/40 focus:bg-black/30"
                        type="text"
                        placeholder="搜索游戏名、标签或文件名"
                    />
                    <button
                        v-if="searchText"
                        class="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white"
                        type="button"
                        title="清空搜索"
                        @click="searchText = ''"
                    >
                        <X class="h-4 w-4" />
                    </button>
                </label>
                <p class="text-sm text-slate-400">
                    显示 <span class="font-semibold text-white">{{ filteredGames.length }}</span> / {{ games.length }}
                </p>
            </section>

            <section v-if="filteredGames.length" class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <button
                    v-for="game in filteredGames"
                    :key="game.id"
                    class="group relative min-h-[190px] overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] p-4 text-left shadow-[0_18px_54px_rgba(0,0,0,0.28)] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.085]"
                    @click="router.push(`/fc/${game.id}`)"
                >
                    <div class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r" :class="game.accent" />
                    <div class="flex items-start justify-between gap-3">
                        <div class="grid h-12 w-12 place-items-center rounded-lg bg-black/20 ring-1 ring-white/10">
                            <FolderOpen v-if="game.id === 'local'" class="h-6 w-6 text-cyan-200" />
                            <Gamepad2 v-else class="h-6 w-6 text-amber-200" />
                        </div>
                        <span
                            class="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-300"
                            >{{ game.tag }}</span
                        >
                    </div>

                    <h2 class="mt-5 text-lg font-semibold text-white">{{ game.name }}</h2>
                    <p class="mt-2 min-h-[48px] text-sm leading-6 text-slate-400">{{ game.desc }}</p>

                    <div class="mt-4 flex items-center justify-between border-t border-white/10 pt-3">
                        <span class="truncate pr-3 text-xs text-slate-500">{{ game.mapper }}</span>
                        <span
                            class="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/10 transition group-hover:bg-white/20"
                        >
                            <Play class="h-4 w-4 fill-current" />
                        </span>
                    </div>
                </button>
            </section>

            <section
                v-else
                class="grid min-h-[220px] place-items-center rounded-lg border border-white/10 bg-white/[0.045] px-4 text-center"
            >
                <div>
                    <Search class="mx-auto h-9 w-9 text-slate-500" />
                    <p class="mt-3 font-semibold text-white">没有匹配的游戏</p>
                    <p class="mt-1 text-sm text-slate-400">换个关键词试试，比如“魂斗罗”“马里奥”“热血”。</p>
                </div>
            </section>

            <aside
                class="flex items-start gap-3 rounded-lg border border-emerald-300/15 bg-emerald-400/[0.07] px-4 py-3 text-sm leading-6 text-emerald-50"
            >
                <ShieldCheck class="mt-0.5 h-5 w-5 shrink-0 text-emerald-200" />
                <p>
                    ROM 文件请使用你拥有授权的版本。固定卡带放在
                    <span class="font-mono text-emerald-100">public/roms/fc/</span>，列表会自动读取生成的清单。
                </p>
            </aside>
        </main>
    </div>
</template>
