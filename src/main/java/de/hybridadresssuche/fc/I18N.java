package de.hybridadresssuche.fc;

import java.util.Locale;
import java.util.MissingResourceException;
import java.util.ResourceBundle;

/**
 * Übersetzungen aus {@code i18n*.properties}.
 */
public final class I18N {

    public static final String BUNDLE_BASE_NAME = "i18n";

    private I18N() {
    }

    public static String localize(String key, Locale locale, String defaultValue) {
        final Locale target = locale != null ? locale : Locale.GERMAN;
        try {
            final ResourceBundle bundle = ResourceBundle.getBundle(BUNDLE_BASE_NAME, target, I18N.class.getClassLoader());
            if (bundle.containsKey(key)) {
                return bundle.getString(key);
            }
        } catch (MissingResourceException ignored) {
            // Fallback auf defaultValue
        }
        return defaultValue;
    }
}
