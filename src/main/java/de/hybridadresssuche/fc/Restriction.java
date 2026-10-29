package de.hybridadresssuche.fc;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;

/**
 * Ortsbeschränkung: Eine CSS-Klasse am Suchfeld (oder einem umgebenden Container) begrenzt die Suche auf
 * bestimmte Postleitzahlen, z. B. {@code openplz-kempten} auf 87435, 87437 und 87439.
 * <p>
 * Format der Plugin-Einstellung (mehrere Einträge mit {@code ;} getrennt):
 * {@code css-klasse=Anzeigename|Suchzusatz|PLZ,PLZ,...}
 */
public final class Restriction {

    private static final Logger LOG = LoggerFactory.getLogger(Restriction.class);

    private static final Pattern CSS_CLASS = Pattern.compile("[A-Za-z][A-Za-z0-9_-]{0,63}");
    private static final Pattern PLZ = Pattern.compile("\\d{5}");
    private static final Pattern PLZ_IN_TEXT = Pattern.compile("\\b(\\d{5})\\b");
    private static final Pattern SAFE_TEXT = Pattern.compile("[^<>\"'`\\\\\\p{Cntrl}]{1,80}");

    private final String cssClass;
    private final String name;
    private final String searchSuffix;
    private final Set<String> postalCodes;

    Restriction(String cssClass, String name, String searchSuffix, Set<String> postalCodes) {
        this.cssClass = cssClass;
        this.name = name;
        this.searchSuffix = searchSuffix;
        this.postalCodes = Collections.unmodifiableSet(new LinkedHashSet<>(postalCodes));
    }

    public String getCssClass() {
        return cssClass;
    }

    public String getName() {
        return name;
    }

    public String getSearchSuffix() {
        return searchSuffix;
    }

    public Set<String> getPostalCodes() {
        return postalCodes;
    }

    public String getHint() {
        return "Es sind nur Adressen in " + name + " möglich (PLZ " + String.join(", ", postalCodes) + ").";
    }

    /** Prüft, ob die erste fünfstellige Zahl im Text (die PLZ eines Adress-Labels) erlaubt ist. */
    public boolean allowsLabel(String label) {
        final Matcher m = PLZ_IN_TEXT.matcher(StringUtils.defaultString(label));
        return m.find() && postalCodes.contains(m.group(1));
    }

    /**
     * Liest die Einstellung. Ungültige Einträge werden mit Warnung übersprungen; ein leerer Wert ergibt die
     * Standard-Beschränkung für Kempten, {@code -} schaltet alle Beschränkungen ab.
     */
    public static Map<String, Restriction> parse(String value) {
        final String raw = StringUtils.isBlank(value) ? Constants.DEFAULT_RESTRICTIONS : value.trim();
        final Map<String, Restriction> result = new LinkedHashMap<>();
        if ("-".equals(raw)) {
            return result;
        }
        for (String entry : raw.split("[;\\r\\n]+")) {
            if (StringUtils.isBlank(entry)) {
                continue;
            }
            final Restriction r = parseEntry(entry.trim());
            if (r == null) {
                LOG.warn("Adresssuche: ungültige Ortsbeschränkung ignoriert: '{}'", StringUtils.abbreviate(entry.trim(), 120));
            } else {
                result.put(r.getCssClass(), r);
            }
        }
        return result;
    }

    static Restriction parseEntry(String entry) {
        final int eq = entry.indexOf('=');
        if (eq <= 0) {
            return null;
        }
        final String cssClass = entry.substring(0, eq).trim();
        final String[] parts = entry.substring(eq + 1).split("\\|", -1);
        if (!CSS_CLASS.matcher(cssClass).matches() || parts.length != 3) {
            return null;
        }
        final String name = parts[0].trim();
        final String suffix = parts[1].trim();
        if (!SAFE_TEXT.matcher(name).matches() || (!suffix.isEmpty() && !SAFE_TEXT.matcher(suffix).matches())) {
            return null;
        }
        final Set<String> codes = new LinkedHashSet<>();
        for (String code : parts[2].split(",")) {
            final String c = code.trim();
            if (c.isEmpty()) {
                continue;
            }
            if (!PLZ.matcher(c).matches()) {
                return null;
            }
            codes.add(c);
        }
        if (codes.isEmpty()) {
            return null;
        }
        return new Restriction(cssClass, name, suffix, codes);
    }

    /** Darstellung für den Browser, Struktur wie CONFIG.RESTRICTIONS im bisherigen Skript. */
    public static JSONObject toJson(Map<String, Restriction> restrictions) {
        final JSONObject json = new JSONObject(true);
        for (Restriction r : restrictions.values()) {
            final JSONObject o = new JSONObject(true);
            o.put("name", r.getName());
            o.put("searchSuffix", r.getSearchSuffix());
            o.put("postalCodes", new JSONArray(new ArrayList<Object>(r.getPostalCodes())));
            o.put("hint", r.getHint());
            json.put(r.getCssClass(), o);
        }
        return json;
    }

    static List<String> filterLabels(List<String> labels, Restriction restriction) {
        if (restriction == null) {
            return labels;
        }
        final List<String> out = new ArrayList<>();
        for (String label : labels) {
            if (restriction.allowsLabel(label)) {
                out.add(label);
            }
        }
        return out;
    }
}
