package de.hybridadresssuche.fc;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import de.xima.fc.interfaces.plugin.lifecycle.helper.IPluginResourceHelper;
import de.xima.fc.plugin.config.IBundleConfigParam;
import de.xima.fc.plugin.config.IBundleProperties;
import de.xima.fc.plugin.models.config.BundleConfigParam;

/**
 * Plugin-Einstellungen in der formcycle Plugin-Verwaltung. Der API-Key ist maskiert ({@code crypticValue=true})
 * und verlässt den Server nie.
 */
public class AdresssucheBundleProperties implements IBundleProperties {

    private static final long serialVersionUID = 1L;

    @Override
    public Map<String, IBundleConfigParam> getConfigProperties() {
        return getConfigProperties(null, Locale.GERMAN);
    }

    @Override
    public Map<String, IBundleConfigParam> getConfigProperties(IPluginResourceHelper resHelper, Locale locale) {
        final Map<String, IBundleConfigParam> map = new LinkedHashMap<>();
        // BundleConfigParam(key, Beschriftung, Pflichtfeld, maskiert, Standardwert)
        map.put(Constants.KEY_BAYERN_API_KEY, new BundleConfigParam(Constants.KEY_BAYERN_API_KEY,
                I18N.localize("bundle.prop.bayernApiKey", locale,
                        "API-Key für den Ortssuchdienst Bayern (geoservices.bayern.de). Bleibt auf dem Server; ohne Key nur OpenPLZ."),
                false, true, ""));
        map.put(Constants.KEY_RESTRICTIONS, new BundleConfigParam(Constants.KEY_RESTRICTIONS,
                I18N.localize("bundle.prop.restrictions", locale,
                        "Ortsbeschränkungen: css-klasse=Name|Suchzusatz|PLZ,PLZ (mehrere mit ; trennen, - = keine)"),
                false, false, Constants.DEFAULT_RESTRICTIONS));
        map.put(Constants.KEY_RATE_LIMIT, new BundleConfigParam(Constants.KEY_RATE_LIMIT,
                I18N.localize("bundle.prop.rateLimit", locale,
                        "Maximale Suchanfragen pro Minute und Besucher (10 bis 10000)"),
                false, false, String.valueOf(Constants.DEFAULT_RATE_LIMIT)));
        map.put(Constants.KEY_GLOBAL_RATE_LIMIT, new BundleConfigParam(Constants.KEY_GLOBAL_RATE_LIMIT,
                I18N.localize("bundle.prop.globalRateLimit", locale,
                        "Maximale Suchanfragen pro Minute für alle Besucher zusammen (100 bis 100000)"),
                false, false, String.valueOf(Constants.DEFAULT_GLOBAL_RATE_LIMIT)));
        map.put(Constants.KEY_DEBUG, new BundleConfigParam(Constants.KEY_DEBUG,
                I18N.localize("bundle.prop.debug", locale, "Debug-Ausgaben in der Browser-Konsole (true/false)"),
                false, false, "false"));
        return map;
    }
}
