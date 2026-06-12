const assets = [
  "/",
  "css/style.css",
  "js/app.js",
  "/images/logo.png",
  "/images/blog2.jpg",
  "/images/favicon.jpg",
  "/icons/icon-128x128.png",
  "/icons/icon-192x192.png",
  "/icons/icon-384x384.png",
  "/icons/icon-512x512.png"
];

const CATALOGUE_ASSETS = "catalogue-assets-v1"; // version your cache

// Install event
self.addEventListener("install", (installEvt) => {
  installEvt.waitUntil(
    caches.open(CATALOGUE_ASSETS).then((cache) => {
      console.log("Caching assets...");
      return cache.addAll(assets);
    }).then(() => self.skipWaiting())
    .catch((e) => console.error("Install error:", e))
  );
});

// Activate event
self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CATALOGUE_ASSETS) {
            console.log("Removed old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener("fetch", (evt) => {
  evt.respondWith(
    fetch(evt.request).catch(() => {
      return caches.open(CATALOGUE_ASSETS).then((cache) => {
        return cache.match(evt.request);
      });
    })
  );
});
