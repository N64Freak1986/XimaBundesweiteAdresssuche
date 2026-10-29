package de.hybridadresssuche.fc;

import java.util.Collections;
import java.util.Map;
import java.util.Properties;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Geprüfte Plugin-Einstellungen einer Installation (Mandant bzw. System).
 * <p>
 * Jede Plugin-Klasse liest die Einstellungen in ihrem eigenen {@code initialize()} und hält sie als Instanzfeld.
 * Es gibt bewusst keinen statischen Speicher, damit der API-Key eines Mandanten nie bei einem anderen landet.
 */
public final class AdresssucheSettings {

    private static final Logger LOG = LoggerFactory.getLogger(AdresssucheSettings.class);

    public static final AdresssucheSettings DEFAULTS = fromProperties(null);

    private final String bayernApiKey;
    private final Map<String, Restriction> restrictions;
    private final int rateLimitPerMinute;
    private final int globalRateLimitPerMinute;
    private final boolean debug;

    private AdresssucheSettings(String bayernApiKey, Map<String, Restriction> restrictions, int rateLimitPerMinute,
            int globalRateLimitPerMinute, boolean debug) {
        this.bayernApiKey = bayernApiKey;
        this.restrictions = Collections.unmodifiableMap(restrictions);
        this.rateLimitPerMinute = rateLimitPerMinute;
        this.globalRateLimitPerMinute = globalRateLimitPerMinute;
        this.debug = debug;
    }

    public static AdresssucheSettings fromProperties(Properties props) {
        final Properties p = props != null ? props : new Properties();
        String apiKey = StringUtils.trimToEmpty(p.getProperty(Constants.KEY_BAYERN_API_KEY));
        if (!apiKey.isEmpty() && !apiKey.matches("[A-Za-z0-9-]{8,128}")) {
            LOG.warn("Adresssuche: Bayern API-Key hat ein ungültiges Format und wird ignoriert.");
            apiKey = "";
        }
        return new AdresssucheSettings(apiKey,
                Restriction.parse(p.getProperty(Constants.KEY_RESTRICTIONS)),
                parseRateLimit(p.getProperty(Constants.KEY_RATE_LIMIT), 10, 10000, Constants.DEFAULT_RATE_LIMIT),
                parseRateLimit(p.getProperty(Constants.KEY_GLOBAL_RATE_LIMIT), 100, 100000,
                        Constants.DEFAULT_GLOBAL_RATE_LIMIT),
                "true".equalsIgnoreCase(StringUtils.trimToEmpty(p.getProperty(Constants.KEY_DEBUG))));
    }

    static int parseRateLimit(String value, int min, int max, int defaultValue) {
        if (StringUtils.isBlank(value)) {
            return defaultValue;
        }
        try {
            final int v = Integer.parseInt(value.trim());
            if (v >= min && v <= max) {
                return v;
            }
        } catch (NumberFormatException ignored) {
            // Standardwert
        }
        LOG.warn("Adresssuche: ungültiges Anfragelimit '{}', verwende {}.", StringUtils.abbreviate(value, 20),
                defaultValue);
        return defaultValue;
    }

    public int getGlobalRateLimitPerMinute() {
        return globalRateLimitPerMinute;
    }

    public String getBayernApiKey() {
        return bayernApiKey;
    }

    public boolean hasBayernApiKey() {
        return !bayernApiKey.isEmpty();
    }

    public Map<String, Restriction> getRestrictions() {
        return restrictions;
    }

    public int getRateLimitPerMinute() {
        return rateLimitPerMinute;
    }

    public boolean isDebug() {
        return debug;
    }
}
