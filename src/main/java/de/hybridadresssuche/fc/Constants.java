package de.hybridadresssuche.fc;

/**
 * Gemeinsame Konstanten des Adresssuche-Plugins.
 */
public final class Constants {

    /** Plugin-Version, wird auch an den Browser gegeben (window.HybridAddressSearch.pluginVersion). */
    public static final String VERSION = "1.0.1";

    /** Name der Servlet-Action: {@code <context>/plugin?name=hybridAdresssuche}. Nach der ersten Auslieferung nie ändern. */
    public static final String SERVLET_NAME = "hybridAdresssuche";
    public static final String RESOURCE_PLUGIN_NAME = "hybridAdresssucheResource";
    public static final String PRERENDER_PLUGIN_NAME = "hybridAdresssuchePreRender";

    /** Dateiname der Formular-Ressource, die die bisherige JS-Datei ersetzt. */
    public static final String RESOURCE_NAME = "hybrid-address-search.js";
    /** Klassenpfad des Browser-Skripts (ES5). */
    public static final String RUNTIME_JS_PATH = "/de/hybridadresssuche/fc/hybrid-address-search.js";

    /** Schlüssel unter XFC_METADATA.pluginResults.&lt;Plugin&gt;. */
    public static final String META_KEY = "hybridAdresssuche";

    // Plugin-Einstellungen (IBundleProperties)
    public static final String PREFIX = "de.hybridadresssuche.fc.";
    public static final String KEY_BAYERN_API_KEY = PREFIX + "bayernApiKey";
    public static final String KEY_RESTRICTIONS = PREFIX + "restrictions";
    public static final String KEY_RATE_LIMIT = PREFIX + "rateLimitPerMinute";
    public static final String KEY_GLOBAL_RATE_LIMIT = PREFIX + "globalRateLimitPerMinute";
    public static final String KEY_DEBUG = PREFIX + "debug";

    public static final String BAYERN_BASE_URL = "https://geoservices.bayern.de/services/ortssuche/v1/adressen/";

    /** Bisherige Kempten-Beschränkung aus V12 des Skripts, Standard für {@link #KEY_RESTRICTIONS}. */
    public static final String DEFAULT_RESTRICTIONS = "openplz-kempten=Kempten (Allgäu)|Kempten|87435,87437,87439";
    public static final int DEFAULT_RATE_LIMIT = 120;
    /** Obergrenze für alle Besucher zusammen; schützt das Kontingent des API-Keys, auch bei ständig neuen Sessions. */
    public static final int DEFAULT_GLOBAL_RATE_LIMIT = 3000;
    public static final int MIN_QUERY_LENGTH = 3;
    public static final int MAX_QUERY_LENGTH = 120;
    public static final int MAX_RESULTS = 50;

    private Constants() {
    }
}
