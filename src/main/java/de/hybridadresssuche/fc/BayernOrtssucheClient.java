package de.hybridadresssuche.fc;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

/**
 * Serverseitiger Zugriff auf den Ortssuchdienst Bayern. Der API-Key wird nur hier an die URL gehängt und nie an den
 * Browser zurückgegeben; Antworten werden auf reine Adress-Labels reduziert.
 */
public class BayernOrtssucheClient {

    /** HTTP-Zugriff, in Tests austauschbar. */
    public interface Fetcher {
        /** @return HTTP-Status und Body (höchstens {@link #MAX_BODY_BYTES}). */
        FetchResult fetch(URI uri) throws IOException, InterruptedException;
    }

    public static final class FetchResult {
        final int status;
        final String body;

        public FetchResult(int status, String body) {
            this.status = status;
            this.body = body;
        }
    }

    /** Ergebnis einer Suche; {@code error != null} bedeutet „Dienst nicht erreichbar“. */
    public static final class SearchResult {
        final List<String> labels;
        final String error;

        SearchResult(List<String> labels, String error) {
            this.labels = labels;
            this.error = error;
        }

        public List<String> getLabels() {
            return labels;
        }

        public String getError() {
            return error;
        }
    }

    static final int MAX_BODY_BYTES = 1024 * 1024;
    static final int CACHE_SIZE = 1000;
    static final long CACHE_TTL_MS = 10 * 60 * 1000L;
    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    /** Buchstaben (inkl. Umlaute/Akzente), Ziffern und übliche Adress-Satzzeichen. */
    private static final Pattern ALLOWED_QUERY = Pattern.compile("[\\p{L}\\p{M}\\p{N} .,\\-/'()&+]+");
    private static final Pattern TAGS = Pattern.compile("<[^>]*>");
    private static final Pattern SPACES = Pattern.compile("\\s+");

    private final Fetcher fetcher;
    private final Map<String, CacheEntry> cache = Collections.synchronizedMap(
            new LinkedHashMap<String, CacheEntry>(64, 0.75f, true) {
                private static final long serialVersionUID = 1L;

                @Override
                protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
                    return size() > CACHE_SIZE;
                }
            });

    public BayernOrtssucheClient() {
        this(new HttpFetcher());
    }

    public BayernOrtssucheClient(Fetcher fetcher) {
        this.fetcher = fetcher;
    }

    /**
     * Normalisiert und prüft den Suchbegriff.
     *
     * @return bereinigter Begriff oder {@code null}, wenn er ungültig ist
     */
    public static String normalizeQuery(String raw) {
        if (raw == null) {
            return null;
        }
        final String q = SPACES.matcher(raw).replaceAll(" ").trim();
        if (q.length() < Constants.MIN_QUERY_LENGTH || q.length() > Constants.MAX_QUERY_LENGTH
                || !ALLOWED_QUERY.matcher(q).matches()) {
            return null;
        }
        return q;
    }

    static URI buildUri(String query, String apiKey) {
        final String path = URLEncoder.encode(query, StandardCharsets.UTF_8).replace("+", "%20");
        return URI.create(Constants.BAYERN_BASE_URL + path
                + "?filter=address&srid=31468&fuzzy=false&api_key="
                + URLEncoder.encode(apiKey, StandardCharsets.UTF_8));
    }

    /**
     * Sucht Adressen. {@code query} muss bereits über {@link #normalizeQuery(String)} geprüft sein.
     */
    public SearchResult search(String query, String apiKey) {
        final String cacheKey = query.toLowerCase(java.util.Locale.ROOT);
        final long now = System.currentTimeMillis();
        final CacheEntry cached = cache.get(cacheKey);
        if (cached != null && now - cached.createdMs < CACHE_TTL_MS) {
            return new SearchResult(cached.labels, null);
        }
        final FetchResult response;
        try {
            response = fetcher.fetch(buildUri(query, apiKey));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new SearchResult(Collections.<String>emptyList(), "interrupted");
        } catch (IOException e) {
            // Keine Exception-Details loggen: die URL enthält den API-Key
            return new SearchResult(Collections.<String>emptyList(), "unreachable");
        }
        if (response.status != 200) {
            return new SearchResult(Collections.<String>emptyList(), "http " + response.status);
        }
        final List<String> labels;
        try {
            labels = parseLabels(response.body);
        } catch (RuntimeException e) {
            return new SearchResult(Collections.<String>emptyList(), "invalid response");
        }
        cache.put(cacheKey, new CacheEntry(labels, now));
        return new SearchResult(labels, null);
    }

    /** Liest {@code results[].attrs.label} und entfernt HTML (die API markiert Treffer mit &lt;b&gt;). */
    static List<String> parseLabels(String body) {
        final List<String> labels = new ArrayList<>();
        final JSONObject root = JSON.parseObject(StringUtils.defaultIfBlank(body, "{}"));
        final JSONArray results = root != null ? root.getJSONArray("results") : null;
        if (results == null) {
            return labels;
        }
        for (int i = 0; i < results.size() && labels.size() < Constants.MAX_RESULTS; i++) {
            final Object item = results.get(i);
            if (!(item instanceof JSONObject)) {
                continue;
            }
            final JSONObject attrs = ((JSONObject) item).getJSONObject("attrs");
            final String label = attrs != null ? toPlainText(attrs.getString("label")) : "";
            if (!label.isEmpty()) {
                labels.add(label);
            }
        }
        return Collections.unmodifiableList(labels);
    }

    static String toPlainText(String html) {
        if (html == null) {
            return "";
        }
        String text = TAGS.matcher(html).replaceAll("");
        text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'")
                .replace("&amp;", "&");
        text = SPACES.matcher(text.replaceAll("\\p{Cntrl}", " ")).replaceAll(" ").trim();
        return StringUtils.abbreviate(text, 200);
    }

    private static final class CacheEntry {
        final List<String> labels;
        final long createdMs;

        CacheEntry(List<String> labels, long createdMs) {
            this.labels = labels;
            this.createdMs = createdMs;
        }
    }

    /** Standard-HTTP-Zugriff: nur HTTPS, keine Weiterleitungen (der Key soll nirgendwo anders hin). */
    static final class HttpFetcher implements Fetcher {
        private final HttpClient client = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();

        @Override
        public FetchResult fetch(URI uri) throws IOException, InterruptedException {
            final HttpRequest request = HttpRequest.newBuilder(uri)
                    .timeout(TIMEOUT)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            final HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream in = response.body()) {
                final byte[] bytes = in.readNBytes(MAX_BODY_BYTES + 1);
                if (bytes.length > MAX_BODY_BYTES) {
                    throw new IOException("response too large");
                }
                return new FetchResult(response.statusCode(), new String(bytes, StandardCharsets.UTF_8));
            }
        }
    }
}
