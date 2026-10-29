package de.hybridadresssuche.fc;

import java.nio.charset.StandardCharsets;
import java.util.Collections;

import org.apache.commons.lang3.StringUtils;

import de.xima.fc.interfaces.plugin.retval.servlet.IPluginServletActionRetVal;
import de.xima.fc.mdl.fdv.EResponseType;
import de.xima.fc.mdl.response.ServletResponse;
import de.xima.fc.plugin.models.retval.servlet.PluginServletActionRetVal;

/**
 * JSON-Antworten für das Plugin-Servlet.
 * <p>
 * Über einen formcycle Frontend-Server wird die Antwort serialisiert an den Frontend-Server zurückgegeben, der die
 * Plugin-Klassen nicht kennt. Deshalb ausschließlich formcycles eigene {@link ServletResponse} verwenden.
 */
final class JsonServletResponses {

    private JsonServletResponses() {
    }

    static IPluginServletActionRetVal create(int statusCode, String jsonBody) {
        final String body = StringUtils.defaultString(jsonBody, "{}");
        final ServletResponse response = new ServletResponse(EResponseType.JSON, body,
                body.getBytes(StandardCharsets.UTF_8));
        response.setContentType("application/json; charset=UTF-8");
        response.setEncoding(StandardCharsets.UTF_8.name());
        response.setHttpStatusCode(statusCode);
        response.setForceDownload(false);
        response.setSessionAttributes(Collections.emptyMap());
        response.addHttpHeader("Cache-Control", "no-store");
        response.addHttpHeader("X-Content-Type-Options", "nosniff");
        return new PluginServletActionRetVal(response, statusCode);
    }
}
