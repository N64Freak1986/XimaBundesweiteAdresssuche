package de.hybridadresssuche.fc;

import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import de.xima.fc.form.common.EFormResourceType;
import de.xima.fc.interfaces.plugin.param.form.IPluginFormResourceGetDataParams;
import de.xima.fc.mdl.enums.EPluginFormResourceType;
import de.xima.fc.plugin.abstracts.AFCPlugin;
import de.xima.fc.plugin.interfaces.form.IPluginFormResource;

/**
 * Formular-Ressource {@code hybrid-address-search.js}: ersetzt die bisher ins Formular hochgeladene JS-Datei.
 * Das Skript enthält keinen API-Key; die Bayern-Suche läuft über {@link AdresssucheServletPlugin}.
 */
public class AdresssucheResourcePlugin extends AFCPlugin implements IPluginFormResource {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(AdresssucheResourcePlugin.class);

    @Override
    public String getName() {
        return Constants.RESOURCE_PLUGIN_NAME;
    }

    @Override
    public String getDescription(Locale locale) {
        return I18N.localize("plugin.resource.description", locale,
                "Adresssuche: Formular-Ressource hybrid-address-search.js (Bayern Ortssuchdienst + OpenPLZ).");
    }

    @Override
    public EPluginFormResourceType getType() {
        return EPluginFormResourceType.JAVASCRIPT;
    }

    @Override
    public EFormResourceType getResourceType() {
        return EFormResourceType.JAVASCRIPT;
    }

    @Override
    public EFormResourceType getRespourceType() {
        return EFormResourceType.JAVASCRIPT;
    }

    @Override
    public String getResourceName() {
        return Constants.RESOURCE_NAME;
    }

    @Override
    public byte[] getResourceData() {
        return loadRuntime();
    }

    @Override
    public byte[] getResourceData(IPluginFormResourceGetDataParams params) {
        return loadRuntime();
    }

    static byte[] loadRuntime() {
        try (InputStream in = AdresssucheResourcePlugin.class.getResourceAsStream(Constants.RUNTIME_JS_PATH)) {
            if (in == null) {
                LOG.error("Adresssuche: {} fehlt im Plugin.", Constants.RUNTIME_JS_PATH);
                return new byte[0];
            }
            return in.readAllBytes();
        } catch (IOException e) {
            LOG.error("Adresssuche: {} konnte nicht gelesen werden.", Constants.RUNTIME_JS_PATH, e);
            return new byte[0];
        }
    }
}
