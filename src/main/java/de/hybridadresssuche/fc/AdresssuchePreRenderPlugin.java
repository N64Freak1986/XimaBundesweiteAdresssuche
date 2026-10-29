package de.hybridadresssuche.fc;

import java.util.Locale;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.alibaba.fastjson.JSONObject;

import de.xima.fc.beans.SerializableJSONObject;
import de.xima.fc.entities.Projekt;
import de.xima.fc.interfaces.form.IFormRequestContext;
import de.xima.fc.interfaces.plugin.lifecycle.IPluginInitializeData;
import de.xima.fc.interfaces.plugin.lifecycle.helper.IPluginResourceHelper;
import de.xima.fc.interfaces.plugin.param.form.IPluginFormPreRenderParams;
import de.xima.fc.interfaces.plugin.retval.form.IPluginFormPreRenderRetVal;
import de.xima.fc.plugin.abstracts.AFCPlugin;
import de.xima.fc.plugin.config.IBundleConfigParam;
import de.xima.fc.plugin.config.IBundleProperties;
import de.xima.fc.plugin.exception.FCPluginException;
import de.xima.fc.plugin.interfaces.form.IPluginFormPreRender;
import de.xima.fc.plugin.models.retval.form.PluginFormPreRenderRetVal;

/**
 * Gibt dem Browser-Skript die Servlet-URL und die Ortsbeschränkungen des Mandanten mit, unter
 * {@code XFC_METADATA.pluginResults.<Plugin>.hybridAdresssuche}. Enthält nie den API-Key.
 */
public class AdresssuchePreRenderPlugin extends AFCPlugin implements IPluginFormPreRender, IBundleProperties {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(AdresssuchePreRenderPlugin.class);

    private final AdresssucheBundleProperties bundleProperties = new AdresssucheBundleProperties();
    private volatile AdresssucheSettings settings = AdresssucheSettings.DEFAULTS;

    @Override
    public String getName() {
        return Constants.PRERENDER_PLUGIN_NAME;
    }

    @Override
    public String getDescription(Locale locale) {
        return I18N.localize("plugin.prerender.description", locale,
                "Adresssuche: stellt Servlet-URL und Ortsbeschränkungen für hybrid-address-search.js bereit.");
    }

    @Override
    public void initialize(IPluginInitializeData data) throws FCPluginException {
        super.initialize(data);
        settings = AdresssucheSettings.fromProperties(data != null ? data.getProperties() : null);
    }

    void applySettings(AdresssucheSettings newSettings) {
        settings = newSettings;
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
    public IPluginFormPreRenderRetVal execute(IPluginFormPreRenderParams params) throws FCPluginException {
        final JSONObject meta = new JSONObject();
        try {
            final IFormRequestContext reqCtx = params != null ? params.getFormRequestContext() : null;
            String contextPath = "";
            Long clientId = null;
            if (reqCtx != null) {
                contextPath = StringUtils.stripEnd(StringUtils.trimToEmpty(reqCtx.getContextPath()), "/");
                final Projekt projekt = reqCtx.getProjekt();
                if (projekt != null && projekt.getMandant() != null) {
                    clientId = projekt.getMandant().getId();
                }
            }
            meta.put(Constants.META_KEY, buildClientConfig(settings, contextPath, clientId));
        } catch (Exception e) {
            LOG.debug("Adresssuche: PreRender-Daten konnten nicht erzeugt werden", e);
        }
        return new PluginFormPreRenderRetVal(new SerializableJSONObject(meta), true);
    }

    /** Konfiguration für den Browser. Mandanten-Plugins sind unter /plugin nur mit client-id erreichbar. */
    static JSONObject buildClientConfig(AdresssucheSettings s, String contextPath, Long clientId) {
        final JSONObject cfg = new JSONObject(true);
        cfg.put("version", Constants.VERSION);
        cfg.put("servletName", Constants.SERVLET_NAME);
        cfg.put("contextPath", StringUtils.defaultString(contextPath));
        if (clientId != null) {
            cfg.put("clientId", clientId);
        }
        cfg.put("servletUrl", StringUtils.defaultString(contextPath) + "/plugin?name=" + Constants.SERVLET_NAME
                + (clientId != null ? "&client-id=" + clientId : ""));
        cfg.put("bayernEnabled", Boolean.valueOf(s.hasBayernApiKey()));
        cfg.put("restrictions", Restriction.toJson(s.getRestrictions()));
        cfg.put("debug", Boolean.valueOf(s.isDebug()));
        return cfg;
    }
}
