package de.hybridadresssuche.fc;

import java.util.concurrent.ConcurrentHashMap;

/**
 * Einfaches Anfragelimit pro Besucher (feste Minutenfenster). Schützt das Kontingent des API-Keys, weil der
 * Servlet-Endpunkt ohne Anmeldung erreichbar ist.
 */
final class RateLimiter {

    static final long WINDOW_MS = 60_000L;
    static final int MAX_TRACKED_KEYS = 20_000;

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    boolean allow(String key, int maxPerMinute, long nowMs) {
        if (windows.size() > MAX_TRACKED_KEYS) {
            windows.entrySet().removeIf(e -> nowMs - e.getValue().startMs >= WINDOW_MS);
        }
        return windows.computeIfAbsent(key, k -> new Window(nowMs)).tryConsume(nowMs, maxPerMinute);
    }

    void clear() {
        windows.clear();
    }

    private static final class Window {
        private long startMs;
        private int count;

        Window(long startMs) {
            this.startMs = startMs;
        }

        synchronized boolean tryConsume(long nowMs, int max) {
            if (nowMs - startMs >= WINDOW_MS) {
                startMs = nowMs;
                count = 0;
            }
            if (count >= max) {
                return false;
            }
            count++;
            return true;
        }
    }
}
