package de.hybridadresssuche.fc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

import de.xima.fc.interfaces.plugin.param.servlet.IPluginServletActionParams;
import de.xima.fc.interfaces.plugin.retval.servlet.IPluginServletActionRetVal;
import de.xima.fc.mdl.response.ServletResponse;
import de.xima.fc.plugin.config.IBundleConfigParam;

class AdresssuchePluginTest {

    private static final String KEY = "a1b2c3d4-0000-1111-2222-333344445555";
    private static final String BAYERN_BODY = "{\"results\":[{\"id\":\"0_1\",\"attrs\":{\"x\":1,\"y\":2,"
            + "\"label\":\"<b>Rathausplatz</b> <b>29</b> 87435 <b>Kempten</b> (Allgäu)\"}},"
            + "{\"id\":\"0_2\",\"attrs\":{\"label\":\"<b>Rathausplatz</b> 1 86150 Augsburg\"}}],\"otherDocs\":0}";

    // ------------------------------------------------------------------------
    // Hilfen
    // ------------------------------------------------------------------------

    /** Fetcher, der Aufrufe mitschreibt und eine feste Antwort liefert. */
    private static final class RecordingFetcher implements BayernOrtssucheClient.Fetcher {
        final List<URI> calls = new ArrayList<>();
        int status = 200;
        String body = BAYERN_BODY;
        IOException failure;

        @Override
        public BayernOrtssucheClient.FetchResult fetch(URI uri) throws IOException {
            calls.add(uri);
            if (failure != null) {
                throw failure;
            }
            return new BayernOrtssucheClient.FetchResult(status, body);
        }
    }

    private static Properties props(String... keyValues) {
        final Properties p = new Properties();
        for (int i = 0; i < keyValues.length; i += 2) {
            p.setProperty(keyValues[i], keyValues[i + 1]);
        }
        return p;
    }

    private static AdresssucheServletPlugin servlet(RecordingFetcher fetcher, Properties p) {
        final AdresssucheServletPlugin plugin = new AdresssucheServletPlugin(new BayernOrtssucheClient(fetcher));
        plugin.applySettings(AdresssucheSettings.fromProperties(p));
        return plugin;
    }

    private static IPluginServletActionParams request(String session, String... keyValues) {
        final Map<String, List<String>> params = new HashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            params.put(keyValues[i], Collections.singletonList(keyValues[i + 1]));
        }
        return (IPluginServletActionParams) Proxy.newProxyInstance(AdresssuchePluginTest.class.getClassLoader(),
                new Class<?>[] { IPluginServletActionParams.class }, (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "getRequestParameters":
                            return params;
                        case "getFrqSessionId":
                            return session;
                        case "getRemoteAddr":
                            return "127.0.0.1";
                        default:
                            return null;
                    }
                });
    }

    private static ServletResponse response(IPluginServletActionRetVal retVal) {
        return (ServletResponse) retVal.getResponse();
    }

    private static JSONObject json(IPluginServletActionRetVal retVal) {
        return JSON.parseObject(new String(response(retVal).getBinValue(), StandardCharsets.UTF_8));
    }

    // ------------------------------------------------------------------------
    // Ortsbeschränkung
    // ------------------------------------------------------------------------

    @Test
    @DisplayName("Ohne Einstellung gilt die bisherige Kempten-Beschränkung")
    void defaultRestrictionIsKempten() {
        final Map<String, Restriction> r = Restriction.parse("");
        assertEquals(1, r.size());
        final Restriction kempten = r.get("openplz-kempten");
        assertNotNull(kempten);
        assertEquals("Kempten (Allgäu)", kempten.getName());
        assertEquals("Kempten", kempten.getSearchSuffix());
        assertEquals(Arrays.asList("87435", "87437", "87439"), new ArrayList<>(kempten.getPostalCodes()));
        assertEquals("Es sind nur Adressen in Kempten (Allgäu) möglich (PLZ 87435, 87437, 87439).", kempten.getHint());
    }

    @Test
    @DisplayName("Mehrere Beschränkungen, ungültige Einträge werden übersprungen, '-' schaltet ab")
    void parseRestrictions() {
        final Map<String, Restriction> r = Restriction.parse(
                "openplz-kempten=Kempten (Allgäu)|Kempten|87435,87437,87439;"
                        + "openplz-sulzberg=Sulzberg||87477;"
                        + "<script>=X||87435;"
                        + "openplz-x=Name|Zusatz|8743;"
                        + "openplz-y=Na<b>me||87435;"
                        + "kaputt");
        assertEquals(Arrays.asList("openplz-kempten", "openplz-sulzberg"), new ArrayList<>(r.keySet()));
        assertEquals("", r.get("openplz-sulzberg").getSearchSuffix());
        assertTrue(Restriction.parse("-").isEmpty());
    }

    @Test
    void restrictionChecksPostalCodeOfLabel() {
        final Restriction kempten = Restriction.parse("").get("openplz-kempten");
        assertTrue(kempten.allowsLabel("Rathausplatz 29 87435 Kempten (Allgäu)"));
        assertFalse(kempten.allowsLabel("Rathausplatz 1 86150 Augsburg"));
        assertFalse(kempten.allowsLabel("ohne PLZ"));
    }

    @Test
    @DisplayName("Browser-Darstellung entspricht CONFIG.RESTRICTIONS aus V12")
    void restrictionJsonMatchesScriptFormat() {
        final JSONObject json = Restriction.toJson(Restriction.parse(""));
        final JSONObject k = json.getJSONObject("openplz-kempten");
        assertEquals("Kempten (Allgäu)", k.getString("name"));
        assertEquals("Kempten", k.getString("searchSuffix"));
        assertEquals(Arrays.asList("87435", "87437", "87439"), k.getJSONArray("postalCodes").toJavaList(String.class));
        assertTrue(k.getString("hint").contains("87437"));
    }

    // ------------------------------------------------------------------------
    // Einstellungen
    // ------------------------------------------------------------------------

    @Test
    void settingsValidation() {
        final AdresssucheSettings ok = AdresssucheSettings.fromProperties(props(Constants.KEY_BAYERN_API_KEY, " " + KEY + " ",
                Constants.KEY_RATE_LIMIT, "60", Constants.KEY_DEBUG, "TRUE"));
        assertEquals(KEY, ok.getBayernApiKey());
        assertEquals(60, ok.getRateLimitPerMinute());
        assertTrue(ok.isDebug());

        final AdresssucheSettings bad = AdresssucheSettings.fromProperties(props(Constants.KEY_BAYERN_API_KEY, "abc&x=1",
                Constants.KEY_RATE_LIMIT, "5"));
        assertFalse(bad.hasBayernApiKey());
        assertEquals(Constants.DEFAULT_RATE_LIMIT, bad.getRateLimitPerMinute());
        assertFalse(bad.isDebug());
        assertEquals(Constants.DEFAULT_RATE_LIMIT, AdresssucheSettings.parseRateLimit("viel", 10, 10000, Constants.DEFAULT_RATE_LIMIT));
    }

    @Test
    @DisplayName("Bundle-Parameter: Map-Key == Property-Key, API-Key maskiert")
    void bundlePropertiesUseKeyAsName() {
        final Map<String, IBundleConfigParam> map = new AdresssucheBundleProperties().getConfigProperties(null, Locale.GERMAN);
        assertEquals(5, map.size());
        for (Map.Entry<String, IBundleConfigParam> e : map.entrySet()) {
            assertEquals(e.getKey(), e.getValue().getName());
        }
        assertTrue(map.get(Constants.KEY_BAYERN_API_KEY).isCrypticValue());
        assertFalse(map.get(Constants.KEY_RESTRICTIONS).isCrypticValue());
        assertEquals(Constants.DEFAULT_RESTRICTIONS, map.get(Constants.KEY_RESTRICTIONS).getDefaultValue());
    }

    // ------------------------------------------------------------------------
    // Ortssuchdienst-Client
    // ------------------------------------------------------------------------

    @Test
    void normalizeQuery() {
        assertEquals("Rathausplatz 29 Kempten", BayernOrtssucheClient.normalizeQuery("  Rathausplatz   29\tKempten "));
        assertEquals("Thomas-Dachser-Str. 4 1/2", BayernOrtssucheClient.normalizeQuery("Thomas-Dachser-Str. 4 1/2"));
        assertEquals("Äußere Rottachstraße", BayernOrtssucheClient.normalizeQuery("Äußere Rottachstraße"));
        assertNull(BayernOrtssucheClient.normalizeQuery("ab"));
        assertNull(BayernOrtssucheClient.normalizeQuery(null));
        assertNull(BayernOrtssucheClient.normalizeQuery("abc?api_key=x"));
        assertNull(BayernOrtssucheClient.normalizeQuery("abc#frag"));
        assertNull(BayernOrtssucheClient.normalizeQuery("<script>alert(1)</script>"));
        assertNull(BayernOrtssucheClient.normalizeQuery("a" + "b".repeat(Constants.MAX_QUERY_LENGTH)));
    }

    @Test
    @DisplayName("URL: Suchbegriff als Pfadsegment kodiert, Key nur im Query-Parameter")
    void buildUri() {
        final URI uri = BayernOrtssucheClient.buildUri("Äußere Str. 1/2", KEY);
        assertEquals("geoservices.bayern.de", uri.getHost());
        assertEquals("https", uri.getScheme());
        assertEquals("/services/ortssuche/v1/adressen/%C3%84u%C3%9Fere%20Str.%201%2F2", uri.getRawPath());
        assertEquals("filter=address&srid=31468&fuzzy=false&api_key=" + KEY, uri.getRawQuery());
    }

    @Test
    void parseLabelsStripsHtml() {
        final List<String> labels = BayernOrtssucheClient.parseLabels(BAYERN_BODY);
        assertEquals(Arrays.asList("Rathausplatz 29 87435 Kempten (Allgäu)", "Rathausplatz 1 86150 Augsburg"), labels);
        assertTrue(BayernOrtssucheClient.parseLabels("{}").isEmpty());
        assertEquals("<img src=x onerror=alert(1)> 87435",
                BayernOrtssucheClient.toPlainText("&lt;img src=x onerror=alert(1)&gt; <b>87435</b>"));
    }

    @Test
    @DisplayName("Treffer werden 10 Minuten zwischengespeichert")
    void searchUsesCache() {
        final RecordingFetcher fetcher = new RecordingFetcher();
        final BayernOrtssucheClient client = new BayernOrtssucheClient(fetcher);
        assertNull(client.search("Rathausplatz", KEY).getError());
        assertEquals(2, client.search("rathausplatz", KEY).getLabels().size());
        assertEquals(1, fetcher.calls.size());
    }

    @Test
    void searchReportsUpstreamErrorsWithoutCaching() {
        final RecordingFetcher fetcher = new RecordingFetcher();
        fetcher.status = 403;
        final BayernOrtssucheClient client = new BayernOrtssucheClient(fetcher);
        assertEquals("http 403", client.search("Rathausplatz", KEY).getError());
        fetcher.failure = new IOException("connect failed: https://geoservices.bayern.de/...api_key=" + KEY);
        final BayernOrtssucheClient.SearchResult r = client.search("Rathausplatz", KEY);
        assertEquals("unreachable", r.getError());
        assertFalse(r.getError().contains(KEY));
        fetcher.failure = null;
        fetcher.status = 200;
        fetcher.body = "kein json";
        assertEquals("invalid response", client.search("Rathausplatz", KEY).getError());
        assertEquals(3, fetcher.calls.size());
    }

    // ------------------------------------------------------------------------
    // Servlet
    // ------------------------------------------------------------------------

    @Test
    @DisplayName("Servlet liefert nur Labels und nie den API-Key")
    void servletSuccess() throws Exception {
        final RecordingFetcher fetcher = new RecordingFetcher();
        final IPluginServletActionRetVal retVal = servlet(fetcher, props(Constants.KEY_BAYERN_API_KEY, KEY))
                .execute(request("s1", "q", "Rathausplatz"));
        assertEquals(200, response(retVal).getHttpStatusCode());
        final String raw = new String(response(retVal).getBinValue(), StandardCharsets.UTF_8);
        assertFalse(raw.contains(KEY));
        assertFalse(raw.contains("bbox"));
        final JSONObject json = JSON.parseObject(raw);
        assertTrue(json.getBooleanValue("ok"));
        final JSONArray results = json.getJSONArray("results");
        assertEquals(2, results.size());
        assertEquals("Rathausplatz 29 87435 Kempten (Allgäu)", results.getJSONObject(0).getString("label"));
        assertEquals(1, results.getJSONObject(0).size());
        assertTrue(response(retVal).getContentType().startsWith("application/json"));
        assertEquals("nosniff", response(retVal).getHttpHeader().get("X-Content-Type-Options"));
        assertTrue(fetcher.calls.get(0).toString().contains("api_key=" + KEY));
    }

    @Test
    @DisplayName("Servlet filtert serverseitig nach Ortsbeschränkung")
    void servletRestriction() throws Exception {
        final RecordingFetcher fetcher = new RecordingFetcher();
        final AdresssucheServletPlugin plugin = servlet(fetcher, props(Constants.KEY_BAYERN_API_KEY, KEY));
        final JSONObject json = json(plugin.execute(request("s1", "q", "Rathausplatz Kempten", "restriction", "openplz-kempten")));
        assertEquals(1, json.getJSONArray("results").size());
        assertTrue(json.getJSONArray("results").getJSONObject(0).getString("label").contains("87435"));

        final IPluginServletActionRetVal unknown = plugin.execute(request("s1", "q", "Rathausplatz", "restriction", "openplz-xyz"));
        assertEquals(400, response(unknown).getHttpStatusCode());
        assertEquals("unknown_restriction", json(unknown).getString("error"));
    }

    @Test
    void servletRejectsInvalidQueryWithoutCallingUpstream() throws Exception {
        final RecordingFetcher fetcher = new RecordingFetcher();
        final AdresssucheServletPlugin plugin = servlet(fetcher, props(Constants.KEY_BAYERN_API_KEY, KEY));
        assertEquals(400, response(plugin.execute(request("s1"))).getHttpStatusCode());
        assertEquals(400, response(plugin.execute(request("s1", "q", "ab"))).getHttpStatusCode());
        assertEquals(400, response(plugin.execute(request("s1", "q", "x?api_key=1"))).getHttpStatusCode());
        assertEquals(400, response(plugin.execute(null)).getHttpStatusCode());
        assertTrue(fetcher.calls.isEmpty());
    }

    @Test
    @DisplayName("Ohne API-Key: 503, kein Aufruf beim Ortssuchdienst")
    void servletWithoutKey() throws Exception {
        final RecordingFetcher fetcher = new RecordingFetcher();
        final IPluginServletActionRetVal retVal = servlet(fetcher, props()).execute(request("s1", "q", "Rathausplatz"));
        assertEquals(503, response(retVal).getHttpStatusCode());
        assertEquals("not_configured", json(retVal).getString("error"));
        assertTrue(fetcher.calls.isEmpty());
    }

    @Test
    void servletUpstreamError() throws Exception {
        final RecordingFetcher fetcher = new RecordingFetcher();
        fetcher.status = 500;
        final IPluginServletActionRetVal retVal = servlet(fetcher, props(Constants.KEY_BAYERN_API_KEY, KEY))
                .execute(request("s1", "q", "Rathausplatz"));
        assertEquals(502, response(retVal).getHttpStatusCode());
        assertFalse(new String(response(retVal).getBinValue(), StandardCharsets.UTF_8).contains(KEY));
    }

    @Test
    @DisplayName("Anfragelimit pro Besucher")
    void servletRateLimit() throws Exception {
        final RecordingFetcher fetcher = new RecordingFetcher();
        final AdresssucheServletPlugin plugin = servlet(fetcher,
                props(Constants.KEY_BAYERN_API_KEY, KEY, Constants.KEY_RATE_LIMIT, "10"));
        for (int i = 0; i < 10; i++) {
            assertEquals(200, response(plugin.execute(request("s1", "q", "Rathausplatz"))).getHttpStatusCode());
        }
        assertEquals(429, response(plugin.execute(request("s1", "q", "Rathausplatz"))).getHttpStatusCode());
        assertEquals(200, response(plugin.execute(request("s2", "q", "Rathausplatz"))).getHttpStatusCode());
    }

    @Test
    void rateLimiterWindowResets() {
        final RateLimiter limiter = new RateLimiter();
        assertTrue(limiter.allow("k", 1, 0L));
        assertFalse(limiter.allow("k", 1, 1000L));
        assertTrue(limiter.allow("k", 1, RateLimiter.WINDOW_MS));
    }

    @Test
    void servletNameIsStable() throws Exception {
        assertEquals("hybridAdresssuche", new AdresssucheServletPlugin().getName());
    }

    // ------------------------------------------------------------------------
    // PreRender und Formular-Ressource
    // ------------------------------------------------------------------------

    @Test
    @DisplayName("PreRender-Daten enthalten Servlet-URL mit client-id, aber keinen API-Key")
    void preRenderConfig() {
        final AdresssucheSettings s = AdresssucheSettings.fromProperties(props(Constants.KEY_BAYERN_API_KEY, KEY));
        final JSONObject cfg = AdresssuchePreRenderPlugin.buildClientConfig(s, "/formcycle", 7L);
        assertEquals("/formcycle/plugin?name=hybridAdresssuche&client-id=7", cfg.getString("servletUrl"));
        assertTrue(cfg.getBooleanValue("bayernEnabled"));
        assertFalse(cfg.getBooleanValue("debug"));
        assertNotNull(cfg.getJSONObject("restrictions").getJSONObject("openplz-kempten"));
        assertFalse(cfg.toJSONString().contains(KEY));

        final JSONObject noKey = AdresssuchePreRenderPlugin.buildClientConfig(AdresssucheSettings.DEFAULTS, "", null);
        assertEquals("/plugin?name=hybridAdresssuche", noKey.getString("servletUrl"));
        assertFalse(noKey.getBooleanValue("bayernEnabled"));
    }

    @Test
    @DisplayName("Browser-Skript: kein API-Key, Version passt, Feldklassen wie V12")
    void runtimeScript() {
        final String js = new String(AdresssucheResourcePlugin.loadRuntime(), StandardCharsets.UTF_8);
        assertFalse(js.isEmpty());
        assertFalse(js.contains("api_key"));
        assertFalse(js.contains("API_KEY"));
        assertTrue(js.contains("var PLUGIN_VERSION = '" + Constants.VERSION + "';"));
        assertTrue(js.contains("var SERVLET_NAME = '" + Constants.SERVLET_NAME + "';"));
        assertTrue(js.contains("var META_KEY = '" + Constants.META_KEY + "';"));
        for (String cls : Arrays.asList("openplz-suche", "openplz-postalcode", "openplz-locality", "openplz-street",
                "openplz-kempten")) {
            assertTrue(js.contains("'" + cls + "'"), cls);
        }
        assertEquals("hybrid-address-search.js", new AdresssucheResourcePlugin().getResourceName());
    }
}
