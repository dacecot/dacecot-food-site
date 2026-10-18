/* da Cecot admin — service worker. Web push only (no offline caching: the admin
   needs live data, and a stale cache would be worse than a reload). Scoped to
   /admin because it is served from /admin/sw.js. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = { title: 'da Cecot', body: '', link: '' };
  try { if (event.data) data = Object.assign(data, event.data.json()); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/admin/icon-192.png',
    badge: '/admin/icon-192.png',
    tag: 'dacecot-admin-' + (data.link || 'general'),
    renotify: true,
    data: { link: data.link || '' }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var link = (event.notification.data && event.notification.data.link) || '';
  var url = '/admin' + (link ? ('#' + link) : '');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cls) {
    for (var i = 0; i < cls.length; i++) {
      var c = cls[i];
      if (c.url.indexOf('/admin') > -1 && 'focus' in c) { try { c.postMessage({ notif: link }); } catch (e) {} return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
