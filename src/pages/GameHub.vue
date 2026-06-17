<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Gamepad2, Play } from 'lucide-vue-next';

const router = useRouter();

const games = [
    {
        id: 'minesweeper',
        name: '扫雷',
        desc: '经典排雷，推理每一次点击',
        emoji: '💣',
        tag: '逻辑',
        accent: 'from-cyan-400 to-blue-500',
        surface: 'bg-cyan-500/10 text-cyan-100 ring-cyan-300/20',
    },
    {
        id: 'snake',
        name: '贪吃蛇',
        desc: '吃掉食物，挑战更长身位',
        emoji: '🐍',
        tag: '反应',
        accent: 'from-lime-400 to-emerald-500',
        surface: 'bg-emerald-500/10 text-emerald-100 ring-emerald-300/20',
    },
    {
        id: 'tetris',
        name: '俄罗斯方块',
        desc: '旋转、堆叠、消除整行',
        emoji: '🧩',
        tag: '街机',
        accent: 'from-fuchsia-400 to-violet-500',
        surface: 'bg-fuchsia-500/10 text-fuchsia-100 ring-fuchsia-300/20',
    },
    {
        id: 'goldminer',
        name: '黄金矿工',
        desc: '抓取黄金，达成关卡目标',
        emoji: '⛏️',
        tag: '休闲',
        accent: 'from-yellow-300 to-amber-500',
        surface: 'bg-amber-500/10 text-amber-100 ring-amber-300/20',
    },
    {
        id: 'tank',
        name: '坦克大战',
        desc: '守住基地，击退敌方坦克',
        emoji: '🎮',
        tag: '射击',
        accent: 'from-red-400 to-rose-500',
        surface: 'bg-rose-500/10 text-rose-100 ring-rose-300/20',
    },
    {
        id: 'spider',
        name: '蜘蛛纸牌',
        desc: '同花顺序收牌，完成整理',
        emoji: '🕷️',
        tag: '纸牌',
        accent: 'from-teal-300 to-cyan-500',
        surface: 'bg-teal-500/10 text-teal-100 ring-teal-300/20',
    },
    {
        id: 'fight',
        name: '斗地主',
        desc: '叫地主、抢先出完手牌',
        emoji: '🃏',
        tag: '对战',
        accent: 'from-orange-400 to-red-500',
        surface: 'bg-orange-500/10 text-orange-100 ring-orange-300/20',
    },
    {
        id: 'fight-lan',
        name: '斗地主局域网',
        desc: '创建三人房间，和同一局域网里的朋友叫分出牌',
        emoji: 'fight-lan-mark',
        tag: '对战',
        accent: 'from-amber-300 via-orange-400 to-red-500',
        surface: 'bg-orange-500/10 text-amber-100 ring-amber-300/20',
    },
    {
        id: 'sokoban',
        name: '推箱子',
        desc: '把箱子推到目标点位',
        emoji: '📦',
        tag: '解谜',
        accent: 'from-stone-300 to-orange-500',
        surface: 'bg-stone-500/10 text-stone-100 ring-stone-300/20',
    },
    {
        id: 'sudoku',
        name: '数独',
        desc: '填满九宫格，保持数字唯一',
        emoji: '🔢',
        tag: '数字',
        accent: 'from-indigo-300 to-sky-500',
        surface: 'bg-indigo-500/10 text-indigo-100 ring-indigo-300/20',
    },
    {
        id: 'chess',
        name: '中国象棋',
        desc: '楚河汉界，和电脑一决高下',
        emoji: '♟️',
        tag: '棋类',
        accent: 'from-red-300 to-amber-500',
        surface: 'bg-red-500/10 text-red-100 ring-red-300/20',
    },
    {
        id: 'chess-lan',
        name: '中国象棋局域网',
        desc: '创建双人房间，和同一局域网里的朋友红黑对弈',
        emoji: '♟️',
        tag: '对战',
        accent: 'from-red-300 via-amber-300 to-stone-600',
        surface: 'bg-amber-500/10 text-amber-100 ring-amber-300/20',
    },
    {
        id: 'klondike',
        name: '接龙',
        desc: '红黑交替排序，归位四花色',
        emoji: '♥️',
        tag: '纸牌',
        accent: 'from-emerald-300 to-green-500',
        surface: 'bg-green-500/10 text-green-100 ring-green-300/20',
    },
    {
        id: 'gomoku',
        name: '五子棋',
        desc: '连成五子，抢占关键棋位',
        emoji: '⚫',
        tag: '棋类',
        accent: 'from-neutral-200 to-yellow-500',
        surface: 'bg-neutral-500/10 text-neutral-100 ring-neutral-300/20',
    },
    {
        id: 'gomoku-lan',
        name: '五子棋局域网',
        desc: '创建双人房间，和同一局域网里的朋友黑白对弈',
        emoji: '⚫',
        tag: '对战',
        accent: 'from-neutral-100 via-amber-300 to-stone-600',
        surface: 'bg-amber-500/10 text-amber-100 ring-amber-300/20',
    },
    {
        id: 'flappy',
        name: '像素鸟',
        desc: '轻点起飞，穿过管道间隙',
        emoji: '🐦',
        tag: '轻量',
        accent: 'from-sky-300 to-blue-500',
        surface: 'bg-sky-500/10 text-sky-100 ring-sky-300/20',
    },
    {
        id: 'jump',
        name: '跳一跳',
        desc: '蓄力跳跃，落在下个方块',
        emoji: '🎯',
        tag: '技巧',
        accent: 'from-pink-300 to-purple-500',
        surface: 'bg-pink-500/10 text-pink-100 ring-pink-300/20',
    },
    {
        id: 'mahjong',
        name: '麻将',
        desc: '四人牌局，摸打碰杠胡',
        emoji: '🀄',
        tag: '国风',
        accent: 'from-green-300 to-emerald-500',
        surface: 'bg-emerald-500/10 text-emerald-100 ring-emerald-300/20',
    },
    {
        id: 'mahjong-lan',
        name: '麻将局域网',
        desc: '创建房间码，和同一局域网里的朋友轮流摸打胡牌',
        emoji: '🀄',
        tag: '对战',
        accent: 'from-emerald-300 via-yellow-300 to-lime-500',
        surface: 'bg-emerald-500/10 text-emerald-100 ring-emerald-300/20',
    },
    {
        id: 'billiards',
        name: '台球',
        desc: '拖拽瞄准，完成清台挑战',
        emoji: '🎱',
        tag: '体育',
        accent: 'from-lime-300 to-teal-500',
        surface: 'bg-lime-500/10 text-lime-100 ring-lime-300/20',
    },
    {
        id: 'ludo',
        name: '飞行棋',
        desc: '四方竞速，先抵达终点',
        emoji: '✈️',
        tag: '桌游',
        accent: 'from-sky-300 to-amber-400',
        surface: 'bg-sky-500/10 text-sky-100 ring-sky-300/20',
    },
    {
        id: 'military',
        name: '四人军棋',
        desc: '蓝方出战，红绿黄三方AI混战',
        emoji: '🚩',
        tag: '策略',
        accent: 'from-blue-300 to-red-500',
        surface: 'bg-blue-500/10 text-blue-100 ring-blue-300/20',
    },
    {
        id: 'go',
        name: '围棋',
        desc: '十九路棋盘，围地提子，和电脑对弈',
        emoji: '⚫',
        tag: '棋类',
        accent: 'from-amber-200 to-emerald-500',
        surface: 'bg-amber-500/10 text-amber-100 ring-amber-300/20',
    },
    {
        id: 'international-chess',
        name: '国际象棋',
        desc: '标准西洋棋规则，和电脑对弈一局',
        emoji: '♞',
        tag: '棋类',
        accent: 'from-stone-200 to-emerald-500',
        surface: 'bg-stone-500/10 text-stone-100 ring-stone-300/20',
    },
    {
        id: 'texas-holdem',
        name: '德州扑克',
        desc: '四人牌桌，下注、加注、摊牌比拼最佳五张',
        emoji: '♠️',
        tag: '纸牌',
        accent: 'from-emerald-300 to-amber-500',
        surface: 'bg-emerald-500/10 text-emerald-100 ring-emerald-300/20',
    },
    {
        id: 'blackjack',
        name: '黑杰克 / 21点',
        desc: '下注、要牌、停牌，和庄家比谁更接近 21 点',
        emoji: '🂡',
        tag: '纸牌',
        accent: 'from-amber-300 to-emerald-500',
        surface: 'bg-amber-500/10 text-amber-100 ring-amber-300/20',
    },
    {
        id: 'uno',
        name: 'UNO 局域网',
        desc: '创建房间码，和同一局域网里的朋友轮流出牌',
        emoji: 'uno-mark',
        tag: '对战',
        accent: 'from-red-400 via-yellow-300 to-blue-500',
        surface: 'bg-red-500/10 text-yellow-100 ring-yellow-300/20',
    },
    {
        id: '2048',
        name: '2048',
        desc: '滑动合并数字方块，冲击 2048 与更高分',
        emoji: '🧮',
        tag: '数字',
        accent: 'from-teal-300 to-amber-400',
        surface: 'bg-teal-500/10 text-teal-100 ring-teal-300/20',
    },
    {
        id: 'fc',
        name: 'FC 游戏',
        desc: '载入 .nes 卡带，重温红白机经典玩法',
        emoji: '🎮',
        tag: '模拟器',
        accent: 'from-cyan-300 to-emerald-500',
        surface: 'bg-cyan-500/10 text-cyan-100 ring-cyan-300/20',
    },
    {
        id: 'gba',
        name: 'GBA 游戏',
        desc: '载入 .gba 卡带，掌机经典在浏览器里继续开局',
        emoji: '🎮',
        tag: '模拟器',
        accent: 'from-violet-300 to-cyan-500',
        surface: 'bg-violet-500/10 text-violet-100 ring-violet-300/20',
    },
];

const gameCount = computed(() => games.length);
</script>

<template>
    <div class="min-h-screen select-none overflow-hidden bg-[#12151c] text-white">
        <div
            class="min-h-screen bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0,rgba(255,255,255,0)_36%),linear-gradient(145deg,rgba(34,211,238,0.08)_0,rgba(34,211,238,0)_32%,rgba(251,191,36,0.07)_72%,rgba(251,191,36,0)_100%)]"
        >
            <main
                class="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-5 sm:gap-6 sm:px-6 sm:py-7 lg:gap-7 lg:px-8 lg:py-8"
            >
                <header class="border-b border-white/10 pb-6">
                    <div class="max-w-2xl">
                        <div
                            class="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300 sm:mb-4"
                        >
                            <Gamepad2 class="h-3.5 w-3.5 text-amber-300" />
                            <span>{{ gameCount }} 款小游戏</span>
                            <span class="h-1 w-1 rounded-full bg-slate-500" />
                            <span>即点即玩</span>
                        </div>
                        <h1 class="text-2xl font-bold tracking-normal text-white sm:text-3xl lg:text-4xl">
                            迷你游戏厅
                        </h1>
                        <p class="mt-2 max-w-xl text-sm leading-6 text-slate-400 sm:mt-3 sm:text-base">
                            从扫雷、纸牌到棋类和街机玩法，挑一个顺手的开局。
                        </p>
                    </div>
                </header>

                <section
                    class="grid w-full grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                >
                    <button
                        v-for="game in games"
                        :key="game.id"
                        class="group relative min-h-[154px] overflow-hidden rounded-lg border border-white/10 bg-white/[0.055] p-3 text-left shadow-[0_16px_50px_rgba(0,0,0,0.24)] transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.085] hover:shadow-[0_22px_60px_rgba(0,0,0,0.34)] active:translate-y-0 sm:min-h-[176px] sm:p-4"
                        @click="router.push(`/${game.id}`)"
                    >
                        <div
                            class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80 transition-opacity duration-300 group-hover:opacity-100"
                            :class="game.accent"
                        />

                        <div class="flex items-start justify-between gap-3">
                            <span
                                class="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-2xl ring-1 transition duration-300 group-hover:scale-105 sm:h-12 sm:w-12"
                                :class="game.surface"
                            >
                                <template v-if="game.id === '2048'">
                                    <span class="game2048-mark" aria-hidden="true">
                                        <span class="game2048-tile game2048-tile-2">2</span>
                                        <span class="game2048-tile game2048-tile-4">4</span>
                                        <span class="game2048-tile game2048-tile-8">8</span>
                                        <span class="game2048-tile game2048-tile-16">16</span>
                                    </span>
                                </template>
                                <template v-else-if="game.id === 'uno'">
                                    <span class="uno-mark" aria-hidden="true">
                                        <span class="uno-mark-inner">
                                            <span class="uno-ribbon uno-ribbon-red" />
                                            <span class="uno-ribbon uno-ribbon-yellow" />
                                            <span class="uno-ribbon uno-ribbon-green" />
                                            <span class="uno-ribbon uno-ribbon-blue" />
                                        </span>
                                    </span>
                                </template>
                                <template v-else-if="game.id === 'fight-lan'">
                                    <span class="fight-lan-mark" aria-hidden="true">
                                        <span class="fight-card fight-card-a">A</span>
                                        <span class="fight-card fight-card-king">王</span>
                                        <span class="fight-card fight-card-2">2</span>
                                    </span>
                                </template>
                                <template v-else>
                                    {{ game.emoji }}
                                </template>
                            </span>
                            <span
                                class="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[11px] font-medium text-slate-400"
                            >
                                {{ game.tag }}
                            </span>
                        </div>

                        <div class="mt-4 sm:mt-5">
                            <h2 class="truncate text-base font-semibold text-white">
                                {{ game.name }}
                            </h2>
                            <p class="mt-2 min-h-[40px] text-sm leading-5 text-slate-400">
                                {{ game.desc }}
                            </p>
                        </div>

                        <div class="mt-3 flex items-center justify-between border-t border-white/10 pt-3 sm:mt-4">
                            <span
                                class="text-xs font-medium text-slate-500 transition-colors duration-300 group-hover:text-slate-300"
                            >
                                开始游戏
                            </span>
                            <span
                                class="grid h-8 w-8 place-items-center rounded-md bg-white/10 text-white transition duration-300 group-hover:bg-white/20"
                            >
                                <Play class="h-4 w-4 fill-current" />
                            </span>
                        </div>
                    </button>
                </section>
            </main>
        </div>
    </div>
</template>

<style scoped>
.uno-mark {
    width: 32px;
    height: 42px;
    position: relative;
    display: grid;
    place-items: center;
    border-radius: 8px;
    border: 2px solid #f7d24d;
    background:
        radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.26), transparent 24%),
        linear-gradient(145deg, #faf7f0, #e8d4b4);
    box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, 0.08),
        0 4px 10px rgba(0, 0, 0, 0.16);
    overflow: hidden;
}

.uno-mark-inner {
    position: relative;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #111827;
    transform: rotate(-18deg) skewX(-8deg);
    overflow: hidden;
    background: #f9f7f0;
}

.uno-ribbon {
    position: absolute;
    left: -3px;
    width: 30px;
    height: 6px;
    border-radius: 999px;
    transform-origin: center;
    opacity: 0.96;
}

.uno-ribbon-red {
    top: 2px;
    background: #ef4444;
    transform: rotate(-28deg);
}

.uno-ribbon-yellow {
    top: 7px;
    background: #fbbf24;
    transform: rotate(18deg);
}

.uno-ribbon-green {
    top: 12px;
    background: #22c55e;
    transform: rotate(-18deg);
}

.uno-ribbon-blue {
    top: 17px;
    background: #3b82f6;
    transform: rotate(26deg);
}

.fight-lan-mark {
    width: 36px;
    height: 36px;
    position: relative;
    display: block;
}

.fight-card {
    position: absolute;
    width: 20px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    border: 1px solid rgba(120, 53, 15, 0.25);
    background: linear-gradient(180deg, #fffaf0, #f8e8c9);
    color: #b91c1c;
    font-size: 10px;
    font-weight: 950;
    box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2);
}

.fight-card-a {
    left: 2px;
    top: 6px;
    transform: rotate(-15deg);
}

.fight-card-king {
    left: 8px;
    top: 3px;
    z-index: 2;
    color: #111827;
}

.fight-card-2 {
    right: 2px;
    top: 6px;
    transform: rotate(15deg);
}

.game2048-mark {
    width: 34px;
    height: 34px;
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background:
        radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.2), transparent 22%),
        linear-gradient(145deg, #2dd4bf, #0f172a 62%, #334155);
    box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.08),
        0 4px 10px rgba(0, 0, 0, 0.16);
}

.game2048-tile {
    display: grid;
    place-items: center;
    border-radius: 4px;
    font-size: 7px;
    font-weight: 900;
    line-height: 1;
    color: #f8fafc;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.24);
    box-shadow:
        inset 0 -2px 3px rgba(0, 0, 0, 0.18),
        inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.game2048-tile-2 {
    background: linear-gradient(145deg, #f8fafc, #c7d2fe);
    color: #1f2937;
}

.game2048-tile-4 {
    background: linear-gradient(145deg, #fde68a, #f59e0b);
}

.game2048-tile-8 {
    background: linear-gradient(145deg, #67e8f9, #0284c7);
}

.game2048-tile-16 {
    background: linear-gradient(145deg, #86efac, #16a34a);
}
</style>
