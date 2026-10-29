package de.hybridadresssuche.fc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Proxy;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.alibaba.fastjson.JSONObject;

import de.xima.fc.interfaces.plugin.param.servlet.IPluginServletActionParams;
import de.xima.fc.interfaces.plugin.retval.servlet.IPluginServletActionRetVal;
import de.xima.fc.mdl.response.ServletResponse;

/**
 * Sicherheitstests (SEC-xx), Ergebnisse siehe docs/SECURITY_REPORT.md.
 */
class AdresssucheSecurityTest {

    private static final String KEY = "a1b2c3d4-0000-1111-2222-333344445555";
    private static final String BODY = "{\"results\":[{\"attrs\":{\"label\":\"<b>Rathausplatz</b> 29 87435 Kempten (Allgäu)\"}}]}";

    private final List<URI> calls = new ArrayList<>();

    private AdresssucheServletPlugin servlet(String... keyValues) {
        final Properties p = new Properties();
        p.setProperty(Constants.KEY_BAYERN_API_KEY, KEY);
        for (int i = 0; i < keyValues.length; i += 2) {
            p.setProperty(keyValues[i], keyValues[i + 1]);
        }
        final AdresssucheServletPlugin plugin = new AdresssucheServletPlugin(new BayernOrtssucheClient(uri -> {
            calls.add(uri);
            return new BayernOrtssucheClient.FetchResult(200, BODY);
        }));
        plugin.applySettings(AdresssucheSettings.fromProperties(p));
        return plugin;
    }

    private static IPluginServletActionParams request(String session, String... keyValues) {
        final Map<String, List<String>> params = new HashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            params.put(keyValues[i], Collections.singletonList(keyValues[i + 1]));
        }
        return (IPluginServletActionParams) Proxy.newProxyInstance(AdresssucheSecurityTest.class.getClassLoader(),
                new Class<?>[] { IPluginServletActionParams.class }, (proxy, method, args) -> {
                    switch (method.getName()) {
                        case "getRequestParameters":
                            return params;
                        case "getSessionID":
                            return session;
                        case "getRemoteAddr":
                            return "203.0.113.7";
                        default:
                            return null;
                    }
                });
    }

    private static int status(IPluginServletActionRetVal r) {
        return ((ServletResponse) r.getResponse()).getHttpStatusCode();
    }

    private static String body(IPluginServletActionRetVal r) {
        return new String(((ServletResponse) r.getResponse()).getBinValue(), StandardCharsets.UTF_8);
    }

    @Test
    @DisplayName("SEC-01 API-Key erscheint in keiner Antwort (Erfolg, Fehler, Upstream-Fehler)")
    void sec01NoKeyInResponses() throws Exception {
        final AdresssucheServletPlugin plugin = servlet();
        for (IPluginServletActionRetVal r : new IPluginServletActionRetVal[] {
                plugin.execute(request("a", "q", "Rathausplatz")),
                plugin.execute(request("a", "q", "x")),
                plugin.execute(request("a", "q", "Rathausplatz", "restriction", "nope")) }) {
            assertFalse(body(r).contains(KEY));
            assertFalse(((ServletResponse) r.getResponse()).getHttpHeader().toString().contains(KEY));
        }
    }

    @Test
    @DisplayName("SEC-02 API-Key nie im Browser: PreRender-Daten und Formular-Ressource")
    void sec02NoKeyInBrowserData() {
        final Properties p = new Properties();
        p.setProperty(Constants.KEY_BAYERN_API_KEY, KEY);
        final JSONObject cfg = AdresssuchePreRenderPlugin.buildClientConfig(AdresssucheSettings.fromProperties(p), "", 1L);
        assertFalse(cfg.toJSONString().contains(KEY));
        final String js = new String(AdresssucheResourcePlugin.loadRuntime(), StandardCharsets.UTF_8);
        assertFalse(js.toLowerCase(Locale.ROOT).contains("api_key"));
    }

    @Test
    @DisplayName("SEC-03 Parameter-Injection in die Upstream-URL (? & # = %) wird abgewiesen")
    void sec03QueryInjection() throws Exception {
        final AdresssucheServletPlugin plugin = servlet();
        for (String q : new String[] { "Rathaus?api_key=x", "Rathaus&srid=1", "Rathaus#x", "Rathaus%2F", "a=b c" }) {
            assertEquals(400, status(plugin.execute(request("a", "q", q))), q);
        }
        assertTrue(calls.isEmpty());
    }

    @Test
    @DisplayName("SEC-04 Pfad bleibt ein einziges Segment unter /adressen/ auf geoservices.bayern.de")
    void sec04PathStaysOnHost() throws Exception {
        servlet().execute(request("a", "q", "../../admin/x"));
        final URI uri = calls.get(0);
        assertEquals("geoservices.bayern.de", uri.getHost());
        assertEquals("https", uri.getScheme());
        assertEquals("/services/ortssuche/v1/adressen/..%2F..%2Fadmin%2Fx", uri.getRawPath());
        assertEquals(uri.getRawPath(), uri.normalize().getRawPath());
    }

    @Test
    @DisplayName("SEC-05 Steuerzeichen/CRLF, HTML und Überlänge werden abgewiesen")
    void sec05InvalidCharacters() {
        assertNull(BayernOrtssucheClient.normalizeQuery("Rathaus\u0000platz"));
        assertNull(BayernOrtssucheClient.normalizeQuery("Rathaus\r\nX-Test: 1"));
        assertNull(BayernOrtssucheClient.normalizeQuery("<img src=x onerror=alert(1)>"));
        assertNull(BayernOrtssucheClient.normalizeQuery("Rathaus‮platz"));
        assertNull(BayernOrtssucheClient.normalizeQuery("a".repeat(Constants.MAX_QUERY_LENGTH + 1)));
    }

    @Test
    @DisplayName("SEC-06 Kein frei wählbares Ziel (SSRF): url/host-Parameter werden ignoriert")
    void sec06NoSsrf() throws Exception {
        servlet().execute(request("a", "q", "Rathausplatz", "url", "http://169.254.169.254/", "host", "evil.example"));
        assertEquals(1, calls.size());
        assertTrue(calls.get(0).toString().startsWith(Constants.BAYERN_BASE_URL));
    }

    @Test
    @DisplayName("SEC-07 Fehlerantworten sind feste Codes ohne Echo der Eingabe (keine Reflected XSS)")
    void sec07NoReflection() throws Exception {
        final String payload = "<script>alert(1)</script>";
        final String b = body(servlet().execute(request("a", "q", "Rathaus", "restriction", payload)));
        assertEquals("{\"ok\":false,\"error\":\"unknown_restriction\"}", b);
    }

    @Test
    @DisplayName("SEC-08 Antwort-Header: JSON, nosniff, no-store")
    void sec08Headers() throws Exception {
        final ServletResponse r = (ServletResponse) servlet().execute(request("a", "q", "Rathausplatz")).getResponse();
        assertTrue(r.getContentType().startsWith("application/json"));
        assertEquals("nosniff", r.getHttpHeader().get("X-Content-Type-Options"));
        assertEquals("no-store", r.getHttpHeader().get("Cache-Control"));
    }

    @Test
    @DisplayName("SEC-09 Globale Obergrenze greift auch bei ständig neuen Sessions")
    void sec09GlobalLimit() throws Exception {
        final AdresssucheServletPlugin plugin = servlet(Constants.KEY_GLOBAL_RATE_LIMIT, "100");
        int ok = 0;
        int limited = 0;
        for (int i = 0; i < 130; i++) {
            final int s = status(plugin.execute(request("session-" + i, "q", "Rathausplatz")));
            if (s == 200) {
                ok++;
            } else if (s == 429) {
                limited++;
            }
        }
        assertEquals(100, ok);
        assertEquals(30, limited);
    }

    @Test
    @DisplayName("SEC-10 Ortsbeschränkung wird serverseitig durchgesetzt")
    void sec10RestrictionServerSide() throws Exception {
        calls.clear();
        final AdresssucheServletPlugin plugin = new AdresssucheServletPlugin(new BayernOrtssucheClient(uri ->
                new BayernOrtssucheClient.FetchResult(200,
                        "{\"results\":[{\"attrs\":{\"label\":\"Marienplatz 1 80331 München\"}}]}")));
        final Properties p = new Properties();
        p.setProperty(Constants.KEY_BAYERN_API_KEY, KEY);
        plugin.applySettings(AdresssucheSettings.fromProperties(p));
        final String b = body(plugin.execute(request("a", "q", "Marienplatz 1", "restriction", "openplz-kempten")));
        assertEquals("{\"ok\":true,\"results\":[]}", b);
    }

    @Test
    @DisplayName("SEC-11 Ungültige Ortsbeschränkungen aus der Plugin-Verwaltung (HTML/Script) werden verworfen")
    void sec11RestrictionConfigSanitized() {
        assertTrue(Restriction.parse("x\"><script>=A||87435;y=<b>||87435;z=A|<i>|87435").isEmpty());
    }

    @Test
    @DisplayName("SEC-12 Mandantentrennung: Einstellungen sind Instanzfelder, kein statischer Key-Speicher")
    void sec12NoStaticKey() {
        for (Class<?> c : new Class<?>[] { AdresssucheServletPlugin.class, AdresssuchePreRenderPlugin.class,
                AdresssucheSettings.class }) {
            for (java.lang.reflect.Field f : c.getDeclaredFields()) {
                if (java.lang.reflect.Modifier.isStatic(f.getModifiers())) {
                    assertFalse(f.getType() == String.class && f.getName().toLowerCase(Locale.ROOT).contains("key")
                            && !f.getName().equals("GLOBAL_RATE_KEY"), c.getSimpleName() + "." + f.getName());
                }
            }
        }
    }
}
