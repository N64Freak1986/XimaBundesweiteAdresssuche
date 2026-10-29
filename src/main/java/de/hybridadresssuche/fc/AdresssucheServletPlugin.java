package de.hybridadresssuche.fc;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.alibaba.fastjson.JSON;

import de.xima.fc.interfaces.plugin.lifecycle.IPluginInitializeData;
import de.xima.fc.interfaces.plugin.lifecycle.IPluginShutdownData;
import de.xima.fc.interfaces.plugin.lifecycle.helper.IPluginResourceHelper;
import de.xima.fc.interfaces.plugin.param.servlet.IPluginServletActionParams;
import de.xima.fc.interfaces.plugin.retval.servlet.IPluginServletActionRetVal;
import de.xima.fc.plugin.abstracts.AFCPlugin;
import de.xima.fc.plugin.config.IBundleConfigParam;
import de.xima.fc.plugin.config.IBundleProperties;
import de.xima.fc.plugin.exception.FCPluginException;
import de.xima.fc.plugin.interfaces.servlet.IPluginServletAction;

/**
 * Proxy für den Ortssuchdienst Bayern: {@code <context>/plugin?name=hybridAdresssuche&q=...[&restriction=css-klasse]}.
 * <p>
 * Ersetzt den direkten Browser-Aufruf mit API-Key aus dem bisherigen Skript. Antwort:
 * {@code {"ok":true,"results":[{"label":"Rathausplatz 29 87435 Kempten (Allgäu)"}]}}.
 */
public class AdresssucheServletPlugin extends AFCPlugin implements IPluginServletAction, IBundleProperties {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(AdresssucheServletPlugin.class);

    static final String GLOBAL_RATE_KEY = "*global*";

    private final AdresssucheBundleProperties bundleProperties = new AdresssucheBundleProperties();
    private transient volatile RateLimiter rateLimiter;
    private transient volatile BayernOrtssucheClient client;
    private volatile AdresssucheSettings settings = AdresssucheSettings.DEFAULTS;

    public AdresssucheServletPlugin() {
        this(new BayernOrtssucheClient());
    }

    AdresssucheServletPlugin(BayernOrtssucheClient client) {
        this.client = client;
        this.rateLimiter = new RateLimiter();
    }

    // Plugin-Objekte sind Serializable: transiente Felder nach dem Deserialisieren neu anlegen
    private BayernOrtssucheClient client() {
        if (client == null) {
            client = new BayernOrtssucheClient();
        }
        return client;
    }

    private RateLimiter rateLimiter() {
        if (rateLimiter == null) {
            rateLimiter = new RateLimiter();
        }
        return rateLimiter;
    }

    @Override
    public String getName() {
        return Constants.SERVLET_NAME;
    }

    @Override
    public String getDescription(Locale locale) {
        return I18N.localize("plugin.servlet.description", locale,
                "Adresssuche: serverseitiger Zugriff auf den Ortssuchdienst Bayern (API-Key bleibt auf dem Server).");
    }

    @Override
    public void initialize(IPluginInitializeData data) throws FCPluginException {
        super.initialize(data);
        applySettings(AdresssucheSettings.fromProperties(data != null ? data.getProperties() : null));
    }

    void applySettings(AdresssucheSettings newSettings) {
        settings = newSettings;
        if (!newSettings.hasBayernApiKey()) {
            LOG.warn("Adresssuche: kein Bayern API-Key hinterlegt, es wird nur OpenPLZ verwendet.");
        }
    }

    @Override
    public void shutdown(IPluginShutdownData data) throws FCPluginException {
        rateLimiter().clear();
        super.shutdown(data);
    }

    @Override
    public Map<String, IBundleConfigParam> getConfigProperties() {
        return bundleProperties.getConfigProperties();
    }

    @Override
    public Map<String, IBundleConfigParam> getConfigProperties(IPluginResourceHelper resHelper, Locale locale) {
        return bundleProperties.getConfigProperties(resHelper, locale);
    }

    @Override
    public IPluginServletActionRetVal execute(IPluginServletActionParams params) throws FCPluginException {
        final AdresssucheSettings current = settings;
        if (params == null) {
            return error(400, "bad_request");
        }
        final long now = System.currentTimeMillis();
        if (!rateLimiter().allow(rateLimitKey(params), current.getRateLimitPerMinute(), now)
                || !rateLimiter().allow(GLOBAL_RATE_KEY, current.getGlobalRateLimitPerMinute(), now)) {
            return error(429, "rate_limited");
        }
        final String query = BayernOrtssucheClient.normalizeQuery(param(params, "q"));
        if (query == null) {
            return error(400, "invalid_query");
        }
        Restriction restriction = null;
        final String restrictionClass = param(params, "restriction");
        if (StringUtils.isNotBlank(restrictionClass)) {
            restriction = current.getRestrictions().get(restrictionClass.trim());
            if (restriction == null) {
                return error(400, "unknown_restriction");
            }
        }
        if (!current.hasBayernApiKey()) {
            return error(503, "not_configured");
        }
        final BayernOrtssucheClient.SearchResult result = client().search(query, current.getBayernApiKey());
        if (result.getError() != null) {
            LOG.warn("Adresssuche: Ortssuchdienst Bayern nicht verfügbar ({}).", result.getError());
            return error(502, "upstream_error");
        }
        final List<String> labels = Restriction.filterLabels(result.getLabels(), restriction);
        final List<Map<String, String>> items = new java.util.ArrayList<>();
        for (String label : labels) {
            final Map<String, String> item = new LinkedHashMap<>();
            item.put("label", label);
            items.add(item);
        }
        final Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", Boolean.TRUE);
        body.put("results", items);
        return JsonServletResponses.create(200, JSON.toJSONString(body));
    }

    static String param(IPluginServletActionParams params, String name) {
        final Map<String, List<String>> map = params.getRequestParameters();
        if (map != null) {
            final List<String> values = map.get(name);
            if (values != null && !values.isEmpty() && values.get(0) != null) {
                return values.get(0);
            }
        }
        if (params.getValueParameters() != null) {
            return params.getValueParameters().getSingleValue(name);
        }
        return null;
    }

    static String rateLimitKey(IPluginServletActionParams params) {
        if (StringUtils.isNotBlank(params.getFrqSessionId())) {
            return "frq:" + params.getFrqSessionId();
        }
        if (StringUtils.isNotBlank(params.getSessionID())) {
            return "sess:" + params.getSessionID();
        }
        if (StringUtils.isNotBlank(params.getRemoteAddr())) {
            return "ip:" + params.getRemoteAddr();
        }
        return "global";
    }

    private static IPluginServletActionRetVal error(int status, String code) {
        final Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", Boolean.FALSE);
        body.put("error", code);
        return JsonServletResponses.create(status, JSON.toJSONString(body));
    }
}
