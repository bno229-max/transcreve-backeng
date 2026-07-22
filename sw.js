/* Voxpaper — Service Worker
   Estratégia: pré-cache do app shell + stale-while-revalidate para estáticos,
   network-first para navegação, e recepção de áudio compartilhado (share_target). */

const CACHE_NAME = 'voxpaper-v2';

const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png'
];

// ---- Instalação: pré-cache do app shell ----
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// ---- Ativação: limpa caches antigos ----
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k.startsWith('voxpaper-') && k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ---- Áudio compartilhado (WhatsApp / sistema) via Web Share Target ----
async function handleSharedAudio(event) {
    const formData = await event.request.formData();
    const file = formData.get('audio') || formData.getAll('files')[0];
    if (!file) return;

    // Aguarda a janela recarregada ficar pronta para receber a mensagem
    for (let i = 0; i < 20; i++) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const client = clients.find(c => c.url.includes('shared-audio')) || clients[0];
        if (client) {
            client.postMessage({ type: 'SHARED_AUDIO', file });
            return;
        }
        await new Promise(r => setTimeout(r, 500));
    }
}

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Recebimento de compartilhamento (POST vindo do sistema)
    if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
        event.respondWith(Response.redirect('./index.html?shared-audio=1', 303));
        event.waitUntil(handleSharedAudio(event));
        return;
    }

    if (event.request.method !== 'GET') return;

    // Navegação: rede primeiro, cache como fallback offline
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(resp => {
                    const copy = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
                    return resp;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Estáticos (mesma origem + Google Fonts): cache primeiro, atualiza em segundo plano
    const sameOrigin = url.origin === self.location.origin;
    const isFont = url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com');
    if (sameOrigin || isFont) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                const network = fetch(event.request)
                    .then(resp => {
                        if (resp && (resp.ok || resp.type === 'opaque')) {
                            const copy = resp.clone();
                            caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
                        }
                        return resp;
                    })
                    .catch(() => cached);
                return cached || network;
            })
        );
    }
    // Demais requisições (ex.: backend de transcrição) seguem direto pela rede.
});
