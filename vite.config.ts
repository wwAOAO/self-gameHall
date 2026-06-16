import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import Inspector from 'unplugin-vue-dev-locator/vite';
import traeBadgePlugin from 'vite-plugin-trae-solo-badge';
import { pikafishPlugin } from './scripts/pikafish-vite-plugin';
import { rapfiPlugin } from './scripts/rapfi-vite-plugin';
import { katagoPlugin } from './scripts/katago-vite-plugin';
import { douzeroPlugin } from './scripts/douzero-vite-plugin';
import { stockfishPlugin } from './scripts/stockfish-vite-plugin';
import { texasAIPlugin } from './scripts/texas-ai-vite-plugin';
import { fcRomManifestPlugin } from './scripts/fc-rom-manifest-vite-plugin';
import { gbaRomManifestPlugin } from './scripts/gba-rom-manifest-vite-plugin';
import { unoLanPlugin } from './scripts/uno-lan-vite-plugin';
import { mahjongLanPlugin } from './scripts/mahjong-lan-vite-plugin';
import { fightLandlordLanPlugin } from './scripts/fight-landlord-lan-vite-plugin';

export default defineConfig({
    server: {
        allowedHosts: ['.loca.lt'],
    },
    build: {
        sourcemap: 'hidden',
    },
    plugins: [
        vue(),
        pikafishPlugin(),
        rapfiPlugin(),
        katagoPlugin(),
        douzeroPlugin(),
        texasAIPlugin(),
        unoLanPlugin(),
        mahjongLanPlugin(),
        fightLandlordLanPlugin(),
        stockfishPlugin(),
        fcRomManifestPlugin(),
        gbaRomManifestPlugin(),
        Inspector(),
        traeBadgePlugin({
            variant: 'dark',
            position: 'bottom-right',
            prodOnly: true,
            clickable: true,
            clickUrl: 'https://www.trae.ai/solo?showJoin=1',
            autoTheme: true,
            autoThemeTarget: '#app',
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            fs: path.resolve(__dirname, './src/shims/emptyNodeModule.ts'),
            pngjs: path.resolve(__dirname, './src/shims/emptyNodeModule.ts'),
        },
    },
});
