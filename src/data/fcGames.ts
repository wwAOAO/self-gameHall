export interface FcGame {
    id: string;
    name: string;
    desc: string;
    tag: string;
    mapper: string;
    romPath?: string;
    loadUrl?: string;
    fileName?: string;
    accent: string;
}

export const fcGames: FcGame[] = [
    {
        id: 'local',
        name: '本地卡带',
        desc: '从电脑选择你拥有授权的 .nes 或 .zip 文件，临时载入游玩。',
        tag: '导入',
        mapper: 'iNES',
        accent: 'from-cyan-300 to-emerald-400',
    },
    {
        id: 'sample',
        name: '示例卡带位',
        desc: '把 ROM 放到 public/roms/fc/sample.nes 后，这张卡片会直接加载它。',
        tag: '预留',
        mapper: 'NROM / 常见 Mapper',
        romPath: '/roms/fc/sample.nes',
        accent: 'from-amber-300 to-red-400',
    },
];

export async function loadFcGames() {
    try {
        const response = await fetch('/roms/fc/manifest.json', { cache: 'no-store' });
        if (!response.ok) return fcGames;
        const manifestGames = ((await response.json()) as FcGame[]).map(game => ({
            ...game,
            loadUrl: game.loadUrl || `/api/fc-rom/${game.id}`,
        }));
        const configuredIds = new Set(fcGames.map(game => game.id));
        return [...fcGames, ...manifestGames.filter(game => !configuredIds.has(game.id))];
    } catch {
        return fcGames;
    }
}

export function findFcGame(id: string | string[] | undefined) {
    const normalizedId = Array.isArray(id) ? id[0] : id;
    return fcGames.find(game => game.id === normalizedId) ?? fcGames[0];
}

export async function loadFcGame(id: string | string[] | undefined) {
    const normalizedId = Array.isArray(id) ? id[0] : id;
    const games = await loadFcGames();
    return games.find(game => game.id === normalizedId) ?? games[0] ?? fcGames[0];
}
