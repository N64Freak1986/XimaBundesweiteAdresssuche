/**
 * Hybrid Adresssuche - Bayern Ortssuchdienst + OpenPLZ (formcycle-Plugin)
 *
 * Nachfolger von hybrid-address-search.js V12. Feldklassen, Ortsbeschränkung per CSS-Klasse und
 * window.HybridAddressSearch bleiben unverändert, damit bestehende Formulare ohne Anpassung weiterlaufen.
 *
 * Unterschiede zu V12:
 * - Kein API-Key im Browser: Die Bayern-Suche läuft über das Plugin-Servlet (plugin?name=hybridAdresssuche).
 * - Ortsbeschränkungen und Debug-Modus kommen aus den Plugin-Einstellungen (PreRender-Metadaten).
 * - Trefferliste wird als Text statt als HTML eingefügt.
 *
 * ES5, benötigt jQuery (von formcycle bereitgestellt).
 */
(function() {
  'use strict';

  var PLUGIN_VERSION = '1.0.1';
  var META_KEY = 'hybridAdresssuche';
  var SERVLET_NAME = 'hybridAdresssuche';

  // Bereits geladen (z. B. Ressource doppelt eingebunden) oder alte Version mit API-Key noch im Formular
  if (window.HybridAddressSearch) {
    if (!window.HybridAddressSearch.pluginVersion && window.console) {
      console.warn('[HybridSearch] Eine ältere hybrid-address-search.js ist noch im Formular eingebunden. ' +
        'Bitte entfernen (enthält den API-Key) – die Plugin-Version wird nicht zusätzlich gestartet.');
    }
    return;
  }

  // ============================================================================
  // KONFIGURATION
  // ============================================================================

  var CONFIG = {
    BAYERN_API: {
      ENABLED: true
    },

    OPENPLZ_API: {
      BASE_URL: 'https://openplzapi.org/de',
      ENABLED: true
    },

    FIELD_CLASSES: {
      suche: 'openplz-suche',
      plz: 'openplz-postalcode',
      ort: 'openplz-locality',
      strasse: 'openplz-street'
    },

    // Ortsbeschränkungen: Schlüssel = CSS-Klasse am Suchfeld oder umgebenden Container.
    // Wird durch die Plugin-Einstellung "Ortsbeschränkungen" ersetzt, sobald die PreRender-Daten vorliegen.
    RESTRICTIONS: {
      'openplz-kempten': {
        name: 'Kempten (Allgäu)',
        searchSuffix: 'Kempten',
        postalCodes: ['87435', '87437', '87439'],
        hint: 'Es sind nur Adressen in Kempten (Allgäu) möglich (PLZ 87435, 87437, 87439).'
      }
    },

    BAYERN_PLZ_RANGES: [
      { min: 80000, max: 87999 },
      { min: 90000, max: 97999 }
    ],

    VALIDATION: {
      STREET_WITH_NUMBER_REGEX: /^(([a-zA-ZäöüÄÖÜß]\D*)\s+\d+?\s*.*)$/,
      ERROR_MESSAGE: 'Bitte geben Sie eine gültige Schreibweise ein z.B. Am Plan 3c | Hauptstr. 4 1/2 | A-Weg 8'
    },

    // Straßennamen-Kürzung (LBDV-Kompatibilität)
    STREET_ABBREVIATION: {
      ENABLED: true,
      APPLY_TO_BAYERN: true,
      APPLY_TO_OPENPLZ: false,
      RULES: [
        {
          // "Straße" → "Str." und "straße" → "str." (Großschreibung bleibt erhalten)
          pattern: /[Ss]traße(\s|$)/g,
          replacement: function(match, p1) {
            return match[0] === 'S' ? 'Str.' + p1 : 'str.' + p1;
          }
        },
        { pattern: /STRASSE(\s|$)/g, replacement: 'STR.$1' }
      ]
    },

    DEBOUNCE_DELAY: 300,
    AUTOCOMPLETE_MIN_LENGTH: 3,
    PAGE_SIZE: 50,
    MAX_PAGES: 20,

    OBSERVER: {
      ENABLED: true,
      DEBOUNCE_DELAY: 100
    },

    DEBUG: false
  };

  // ============================================================================
  // GLOBALE VARIABLEN
  // ============================================================================

  var observerDebounceTimer = null;
  var streetCache = {};
  var fieldGroups = [];
  var mutationObserver = null;
  var pluginMeta = null;
  var servletUrls = null;
  var workingServletUrl = null;

  // ============================================================================
  // HILFSFUNKTIONEN
  // ============================================================================

  function log(message, data, level) {
    level = level || 'info';
    if (!CONFIG.DEBUG && level !== 'warn' && level !== 'error') return;
    if (!window.console) return;

    var prefix = {
      'info': '✓',
      'debug': '🔍',
      'warn': '⚠️',
      'error': '❌',
      'success': '✅'
    }[level] || '•';

    console.log(prefix + ' [HybridSearch] ' + message, data || '');
  }

  // ----------------------------------------------------------------------------
  // Plugin-Konfiguration (PreRender) und Servlet-URL
  // ----------------------------------------------------------------------------

  /** Sucht hybridAdresssuche in XFC_METADATA.pluginResults.<Plugin> (oder direkt in XFC_METADATA). */
  function findPluginMeta() {
    var meta = window.XFC_METADATA;
    if (!meta) return null;
    if (meta[META_KEY]) return meta[META_KEY];
    var results = meta.pluginResults;
    if (results) {
      if (results[META_KEY]) return results[META_KEY];
      for (var key in results) {
        if (results.hasOwnProperty(key) && results[key] && results[key][META_KEY]) {
          return results[key][META_KEY];
        }
      }
    }
    return null;
  }

  function applyPluginConfig() {
    pluginMeta = findPluginMeta();
    if (!pluginMeta) {
      log('Keine Plugin-Metadaten gefunden – Standardwerte (Kempten-Beschränkung) aktiv', null, 'debug');
      return;
    }
    if (pluginMeta.restrictions && typeof pluginMeta.restrictions === 'object') {
      CONFIG.RESTRICTIONS = pluginMeta.restrictions;
    }
    if (pluginMeta.bayernEnabled === false) {
      CONFIG.BAYERN_API.ENABLED = false;
      log('Kein Bayern API-Key im Plugin hinterlegt – nur OpenPLZ aktiv', null, 'warn');
    }
    CONFIG.DEBUG = pluginMeta.debug === true;
  }

  /** Mandanten-ID für /plugin?name=... (ohne sie liefert formcycle bei Mandanten-Plugins HTTP 404). */
  function resolveClientId() {
    if (pluginMeta && pluginMeta.clientId) return String(pluginMeta.clientId);
    var meta = window.XFC_METADATA || {};
    if (meta.client && meta.client.id) return String(meta.client.id);
    if (meta.clientId) return String(meta.clientId);
    var nodes = document.querySelectorAll("script[src*='mid='], link[href*='mid=']");
    for (var i = 0; i < nodes.length; i++) {
      var src = nodes[i].getAttribute('src') || nodes[i].getAttribute('href') || '';
      var m = /[?&]mid=(\d+)/.exec(src);
      if (m) return m[1];
    }
    return null;
  }

  function withClientId(url) {
    if (!url || /[?&](client-id|mandantName)=/.test(url)) return url;
    var cid = resolveClientId();
    return cid ? url + (url.indexOf('?') >= 0 ? '&' : '?') + 'client-id=' + encodeURIComponent(cid) : url;
  }

  /** Mögliche Servlet-URLs in absteigender Priorität (Master-Server, Frontend-Server, relativ). */
  function getServletUrls() {
    if (servletUrls) return servletUrls;
    var urls = [];
    function add(u) {
      u = withClientId(u);
      if (u && urls.indexOf(u) === -1) urls.push(u);
    }
    if (pluginMeta && pluginMeta.servletUrl) add(pluginMeta.servletUrl);
    var metaBase = window.XFC_METADATA && window.XFC_METADATA.urls && window.XFC_METADATA.urls.plugin;
    if (metaBase) add(metaBase + (metaBase.indexOf('?') >= 0 ? '&' : '?') + 'name=' + SERVLET_NAME);
    var path = window.location.pathname || '';
    var idx = path.indexOf('/form/');
    if (idx >= 0) add(path.substring(0, idx) + '/plugin?name=' + SERVLET_NAME);
    add('plugin?name=' + SERVLET_NAME);
    servletUrls = urls;
    return urls;
  }

  function isBayernPLZ(plz) {
    var plzNum = parseInt(plz, 10);
    if (isNaN(plzNum)) return false;

    for (var i = 0; i < CONFIG.BAYERN_PLZ_RANGES.length; i++) {
      var range = CONFIG.BAYERN_PLZ_RANGES[i];
      if (plzNum >= range.min && plzNum <= range.max) {
        return true;
      }
    }
    return false;
  }

  function extractPLZ(suchbegriff) {
    var match = suchbegriff.match(/\b(\d{5})\b/);
    return match ? match[1] : null;
  }

  function hasHouseNumber(streetInput) {
    return CONFIG.VALIDATION.STREET_WITH_NUMBER_REGEX.test(streetInput.trim());
  }

  // ----------------------------------------------------------------------------
  // Ortsbeschränkung
  // ----------------------------------------------------------------------------

  /**
   * Ermittelt, ob das Suchfeld (oder ein umgebender Container) eine
   * Beschränkungsklasse trägt. closest() prüft auch das Element selbst.
   */
  function detectRestriction($suchField) {
    for (var cls in CONFIG.RESTRICTIONS) {
      if (CONFIG.RESTRICTIONS.hasOwnProperty(cls) && $suchField.closest('.' + cls).length > 0) {
        var restriction = CONFIG.RESTRICTIONS[cls];
        restriction.cssClass = cls;
        log('Ortsbeschränkung erkannt: ' + cls + ' (' + restriction.name + ')', null, 'debug');
        return restriction;
      }
    }
    return null;
  }

  function isAllowedPLZ(plz, restriction) {
    if (!restriction) return true;
    return restriction.postalCodes.indexOf(String(plz).trim()) !== -1;
  }

  function filterByRestriction(results, restriction) {
    if (!restriction) return results;
    return results.filter(function(item) {
      return item && isAllowedPLZ(item.plz, restriction);
    });
  }

  /**
   * Kürzt Straßennamen gemäß LBDV-Konvention
   * z.B. "Herrenstraße 7" -> "Herrenstr. 7"
   */
  function abbreviateStreetName(streetName, source) {
    if (!CONFIG.STREET_ABBREVIATION.ENABLED) {
      return streetName;
    }
    if (source === 'bayern' && !CONFIG.STREET_ABBREVIATION.APPLY_TO_BAYERN) {
      return streetName;
    }
    if (source === 'openplz' && !CONFIG.STREET_ABBREVIATION.APPLY_TO_OPENPLZ) {
      return streetName;
    }

    var result = streetName;
    CONFIG.STREET_ABBREVIATION.RULES.forEach(function(rule) {
      result = result.replace(rule.pattern, rule.replacement);
    });

    if (result !== streetName) {
      log('Straßenname gekürzt: "' + streetName + '" -> "' + result + '"', null, 'debug');
    }

    return result;
  }

  function parseLabel(label) {
    var plainText = String(label || '').replace(/<[^>]+>/g, '');
    var plzMatch = plainText.match(/\b(\d{5})\b/);

    return {
      plainText: plainText,
      plz: plzMatch ? plzMatch[1] : ''
    };
  }

  function analyzeInput(input) {
    var trimmed = input.trim();
    var plz = extractPLZ(trimmed);

    if (/^\d{5}$/.test(trimmed)) {
      return {
        type: 'postalcode_only',
        value: trimmed,
        plz: trimmed,
        isBayern: isBayernPLZ(trimmed),
        description: 'Nur PLZ eingegeben'
      };
    }

    if (plz) {
      return {
        type: 'with_postalcode',
        value: trimmed,
        plz: plz,
        isBayern: isBayernPLZ(plz),
        description: 'Text mit PLZ ' + plz + (isBayernPLZ(plz) ? ' (Bayern)' : ' (nicht Bayern)')
      };
    }

    if (/\d+/.test(trimmed) && /[a-zA-ZäöüÄÖÜß]/.test(trimmed)) {
      return {
        type: 'street_with_number',
        value: trimmed,
        plz: null,
        isBayern: null,
        description: 'Straße mit Nummer (ohne PLZ)'
      };
    }

    if (/^[a-zA-ZäöüÄÖÜß\s\-\.]+$/.test(trimmed)) {
      return {
        type: 'street_or_city',
        value: trimmed,
        plz: null,
        isBayern: null,
        description: 'Straße oder Ort (ohne PLZ)'
      };
    }

    return {
      type: 'mixed',
      value: trimmed,
      plz: null,
      isBayern: null,
      description: 'Gemischte Eingabe'
    };
  }

  function findNextFieldWithClass($startElement, className) {
    var $siblings = $startElement.nextAll('.' + className + ':first');
    if ($siblings.length > 0) {
      return $siblings;
    }

    var $parent = $startElement.parent();
    var $inParent = $parent.find('.' + className).not($startElement);
    if ($inParent.length > 0) {
      return $inParent.first();
    }

    var $nextContainers = $parent.nextAll();
    for (var i = 0; i < $nextContainers.length; i++) {
      var $found = $($nextContainers[i]).find('.' + className + ':first');
      if ($found.length > 0) {
        return $found;
      }
    }

    // Für wiederholbare Container: Suche im gleichen Container-Block
    var $containerBlock = $startElement.closest('[id*="_c_"]');
    if ($containerBlock.length > 0) {
      var $inContainer = $containerBlock.find('.' + className).not($startElement);
      if ($inContainer.length > 0) {
        return $inContainer.first();
      }
    }

    var allSuchFields = $('.' + CONFIG.FIELD_CLASSES.suche);
    var suchIndex = allSuchFields.index($startElement);

    if (suchIndex >= 0) {
      var allTargetFields = $('.' + className);
      if (suchIndex < allTargetFields.length) {
        return allTargetFields.eq(suchIndex);
      }
    }

    return $();
  }

  function createFieldGroup($suchField) {
    var suchId = $suchField.attr('id') || $suchField.attr('name') || 'unknown';
    log('Erstelle Feldgruppe für: ' + suchId, null, 'debug');

    var $plzField = findNextFieldWithClass($suchField, CONFIG.FIELD_CLASSES.plz);
    var $ortField = findNextFieldWithClass($suchField, CONFIG.FIELD_CLASSES.ort);
    var $strasseField = findNextFieldWithClass($suchField, CONFIG.FIELD_CLASSES.strasse);

    // Pflichtfelder: suche, plz, ort – optional: strasse
    if ($plzField.length === 0 || $ortField.length === 0) {
      log('Unvollständige Feldgruppe für: ' + suchId + ' (PLZ oder Ort fehlt)', null, 'warn');
      return null;
    }

    if ($strasseField.length === 0) {
      log('Feldgruppe ' + suchId + ': openplz-street nicht vorhanden (optional)', null, 'debug');
    }

    var group = {
      suche: $suchField,
      plz: $plzField,
      ort: $ortField,
      strasse: $strasseField.length > 0 ? $strasseField : null,
      hasStrasseField: $strasseField.length > 0,
      restriction: detectRestriction($suchField),
      id: suchId,
      source: null,
      isLocked: false,
      searchDisabled: false,
      selectedStreet: null,
      debounceTimer: null,
      requestSeq: 0
    };

    log('Feldgruppe erstellt: ' + suchId +
        (group.hasStrasseField ? ' (mit Straßenfeld)' : ' (ohne Straßenfeld)') +
        (group.restriction ? ' [beschränkt auf ' + group.restriction.name + ']' : ''), null, 'success');
    return group;
  }

  // ============================================================================
  // VALIDIERUNG UND FEHLERMELDUNGEN
  // ============================================================================

  function showFieldError($field, message) {
    clearFieldError($field);

    var $error = $('<div class="hybrid-field-error" style="color: #d32f2f; font-size: 12px; margin-top: 4px; padding: 4px 8px; background: #ffebee; border-radius: 4px; border-left: 3px solid #d32f2f;"></div>');
    $error.text(message);

    $field.after($error);
    $field.css('border-color', '#d32f2f');

    log('Fehlermeldung angezeigt: ' + message, null, 'debug');
  }

  function clearFieldError($field) {
    $field.next('.hybrid-field-error').remove();
    $field.css('border-color', '');
  }

  function lockFields(group) {
    if (group.isLocked) return;

    group.plz.prop('readonly', true);
    group.ort.prop('readonly', true);

    group.plz.css({ 'background-color': '#f5f5f5', 'cursor': 'not-allowed' });
    group.ort.css({ 'background-color': '#f5f5f5', 'cursor': 'not-allowed' });

    group.isLocked = true;
    log('PLZ/Ort Felder gesperrt für Gruppe: ' + group.id, null, 'debug');
  }

  function unlockFields(group) {
    if (!group.isLocked) return;

    group.plz.prop('readonly', false);
    group.ort.prop('readonly', false);

    group.plz.css({ 'background-color': '', 'cursor': '' });
    group.ort.css({ 'background-color': '', 'cursor': '' });

    group.isLocked = false;
    log('PLZ/Ort Felder entsperrt für Gruppe: ' + group.id, null, 'debug');
  }

  function disableSearch(group) {
    group.searchDisabled = true;
    log('Suche deaktiviert für Gruppe: ' + group.id, null, 'debug');
  }

  function enableSearch(group) {
    group.searchDisabled = false;
    group.selectedStreet = null;
    log('Suche aktiviert für Gruppe: ' + group.id, null, 'debug');
  }

  function validateStreetField(group) {
    if (group.source !== 'openplz') {
      clearFieldError(group.suche);
      return true;
    }

    var value = group.suche.val().trim();

    if (!value) {
      clearFieldError(group.suche);
      return true;
    }

    if (!hasHouseNumber(value)) {
      showFieldError(group.suche, CONFIG.VALIDATION.ERROR_MESSAGE);
      return false;
    }

    clearFieldError(group.suche);
    return true;
  }

  /**
   * Prüft bei beschränkten Gruppen, ob die (ggf. manuell eingetippte) PLZ erlaubt ist
   */
  function validatePLZRestriction(group) {
    if (!group.restriction) return true;

    var value = (group.plz.val() || '').trim();

    if (!value || isAllowedPLZ(value, group.restriction)) {
      clearFieldError(group.plz);
      return true;
    }

    showFieldError(group.plz, group.restriction.hint);
    return false;
  }

  // ============================================================================
  // BAYERN ORTSSUCHDIENST (über das Plugin-Servlet)
  // ============================================================================

  /**
   * Fragt den Ortssuchdienst Bayern über den Server ab. Der API-Key ist nur dort hinterlegt.
   * Bei HTTP 404 wird die nächste mögliche Servlet-URL probiert (Frontend-Server, andere Kontextpfade).
   */
  function searchBayernAPI(suchbegriff, restriction, callback) {
    if (!CONFIG.BAYERN_API.ENABLED) {
      callback(null, []);
      return;
    }

    log('Bayern Suche (Server): ' + suchbegriff, null, 'debug');

    var data = { q: suchbegriff };
    if (restriction && restriction.cssClass) {
      data.restriction = restriction.cssClass;
    }

    var candidates = workingServletUrl ? [workingServletUrl] : getServletUrls();

    function attempt(index) {
      $.ajax({
        url: candidates[index],
        method: 'GET',
        dataType: 'json',
        data: data,
        cache: false,
        timeout: 8000,
        success: function(response) {
          workingServletUrl = candidates[index];
          if (response && response.ok && Array.isArray(response.results)) {
            log('Bayern Suche: ' + response.results.length + ' Ergebnisse', null, 'success');
            callback(null, response.results);
          } else {
            callback(null, []);
          }
        },
        error: function(xhr, status, error) {
          if (xhr && xhr.status === 404 && !workingServletUrl && index + 1 < candidates.length) {
            attempt(index + 1);
            return;
          }
          if (xhr && xhr.status === 503) {
            CONFIG.BAYERN_API.ENABLED = false;
            log('Bayern Suche im Plugin nicht konfiguriert (kein API-Key)', null, 'warn');
          } else {
            log('Bayern Suche Fehler: ' + (xhr && xhr.status) + ' ' + (error || status), null, 'error');
          }
          callback(error || status, []);
        }
      });
    }

    attempt(0);
  }

  function extractBayernAddressData(result) {
    if (!result || !result.label) {
      return null;
    }

    var parsed = parseLabel(result.label);
    var plain = parsed.plainText;

    var data = {
      strasse: '',
      plz: parsed.plz,
      ort: '',
      vollstaendig: plain,
      source: 'bayern'
    };

    if (parsed.plz) {
      var plzIndex = plain.indexOf(parsed.plz);
      if (plzIndex > 0) {
        data.strasse = plain.substring(0, plzIndex).trim();
        var afterPLZ = plain.substring(plzIndex + 5).trim();
        data.ort = afterPLZ.replace(/^[,\s]+/, '').trim();
      }
    }

    // Straßennamen-Kürzung (LBDV-Kompatibilität)
    data.strasse = abbreviateStreetName(data.strasse, 'bayern');
    data.vollstaendig = abbreviateStreetName(data.vollstaendig, 'bayern');

    return data;
  }

  function mapBayernResults(bayernResults) {
    return (bayernResults || []).map(function(result) {
      return extractBayernAddressData(result);
    }).filter(function(item) {
      return item !== null;
    });
  }

  // ============================================================================
  // OPENPLZ API FUNKTIONEN
  // ============================================================================

  function loadStreetsForPostalCode(postalCode, callback) {
    var cacheKey = 'streets_' + postalCode;

    if (streetCache[cacheKey]) {
      log('Straßen aus Cache für PLZ ' + postalCode, null, 'debug');
      callback(null, streetCache[cacheKey]);
      return;
    }

    if (!CONFIG.OPENPLZ_API.ENABLED) {
      callback(null, []);
      return;
    }

    log('Lade Straßen für PLZ ' + postalCode + ' von OpenPLZ', null, 'debug');

    var allStreets = [];
    var currentPage = 1;

    function loadPage() {
      $.ajax({
        url: CONFIG.OPENPLZ_API.BASE_URL + '/Streets',
        method: 'GET',
        dataType: 'json',
        data: {
          postalCode: postalCode,
          page: currentPage,
          pageSize: CONFIG.PAGE_SIZE
        },
        timeout: 5000,
        success: function(data) {
          if (data && Array.isArray(data) && data.length > 0) {
            allStreets = allStreets.concat(data);
            log('OpenPLZ Seite ' + currentPage + ': ' + data.length + ' Straßen', null, 'debug');

            if (data.length === CONFIG.PAGE_SIZE && currentPage < CONFIG.MAX_PAGES) {
              currentPage++;
              loadPage();
            } else {
              log('OpenPLZ: ' + allStreets.length + ' Straßen für PLZ ' + postalCode, null, 'success');
              streetCache[cacheKey] = allStreets;
              callback(null, allStreets);
            }
          } else {
            streetCache[cacheKey] = allStreets;
            callback(null, allStreets);
          }
        },
        error: function(xhr, status, error) {
          log('OpenPLZ Fehler: ' + error, null, 'error');
          callback(error, null);
        }
      });
    }

    loadPage();
  }

  function extractOpenPLZAddressData(street) {
    if (!street) {
      return null;
    }

    var strasseName = street.name || '';
    var plz = street.postalCode || '';
    var ort = street.locality || '';

    return {
      strasse: strasseName,
      plz: plz,
      ort: ort,
      vollstaendig: strasseName + ' ' + plz + ' ' + ort,
      source: 'openplz'
    };
  }

  function mapOpenPLZStreets(streets) {
    return (streets || []).map(function(street) {
      return extractOpenPLZAddressData(street);
    }).filter(function(item) {
      return item !== null && item.strasse;
    });
  }

  // ============================================================================
  // HYBRID SEARCH LOGIK
  // ============================================================================

  /**
   * Suche für beschränkte Feldgruppen (z.B. nur Kempten)
   */
  function restrictedSearch(suchbegriff, inputAnalysis, restriction, callback) {
    log('→ Beschränkte Suche (' + restriction.name + ')', null, 'info');

    // Fremde PLZ eingegeben → gar nicht erst suchen
    if (inputAnalysis.plz && !isAllowedPLZ(inputAnalysis.plz, restriction)) {
      log('PLZ ' + inputAnalysis.plz + ' liegt außerhalb von ' + restriction.name, null, 'debug');
      callback(null, []);
      return;
    }

    // Nur erlaubte PLZ → Straßenliste aus OpenPLZ
    if (inputAnalysis.type === 'postalcode_only') {
      loadStreetsForPostalCode(inputAnalysis.plz, function(error, streets) {
        callback(null, filterByRestriction(mapOpenPLZStreets(streets), restriction));
      });
      return;
    }

    // Ohne PLZ/Ortsname: Ort anhängen, damit der Ortssuchdienst passende Treffer liefert
    var query = suchbegriff;
    if (!inputAnalysis.plz &&
        restriction.searchSuffix &&
        query.toLowerCase().indexOf(restriction.searchSuffix.toLowerCase()) === -1) {
      query = query + ' ' + restriction.searchSuffix;
    }

    searchBayernAPI(query, restriction, function(error, bayernResults) {
      callback(null, filterByRestriction(mapBayernResults(bayernResults), restriction));
    });
  }

  function hybridSearch(suchbegriff, group, callback) {
    log('Starte Hybrid-Suche für: ' + suchbegriff, null, 'info');

    var inputAnalysis = analyzeInput(suchbegriff);
    log('Eingabetyp: ' + inputAnalysis.description, null, 'debug');

    if (group.restriction) {
      restrictedSearch(suchbegriff, inputAnalysis, group.restriction, callback);
      return;
    }

    if (inputAnalysis.type === 'postalcode_only') {
      log('→ Nur PLZ erkannt: Lade Straßen von OpenPLZ', null, 'info');
      loadStreetsForPostalCode(inputAnalysis.plz, function(error, streets) {
        callback(null, error ? [] : mapOpenPLZStreets(streets));
      });
      return;
    }

    if (inputAnalysis.type === 'with_postalcode' && inputAnalysis.plz && !inputAnalysis.isBayern) {
      log('→ Nicht-bayerische PLZ erkannt (' + inputAnalysis.plz + '): Wechsle zu OpenPLZ', null, 'info');

      loadStreetsForPostalCode(inputAnalysis.plz, function(error, streets) {
        if (error || !streets || streets.length === 0) {
          callback(null, []);
          return;
        }
        var searchWithoutPLZ = suchbegriff
          .replace(/\d{5}/g, '')
          .replace(/,/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

        var streetSearch = searchWithoutPLZ.split(' ')[0];

        var filteredStreets = streets.filter(function(street) {
          var streetName = (street.name || '').toLowerCase();
          return streetName.indexOf(streetSearch) !== -1 ||
                 streetSearch.indexOf(streetName.substring(0, 5)) !== -1 ||
                 streetSearch.length < 3;
        });

        if (filteredStreets.length === 0) {
          filteredStreets = streets;
        }

        callback(null, mapOpenPLZStreets(filteredStreets));
      });
      return;
    }

    log(inputAnalysis.plz ?
      '→ Bayerische PLZ erkannt (' + inputAnalysis.plz + '): Suche im Ortssuchdienst Bayern' :
      '→ Keine PLZ erkannt: Suche im Ortssuchdienst Bayern (Standard)', null, 'info');

    searchBayernAPI(suchbegriff, null, function(error, bayernResults) {
      callback(null, mapBayernResults(bayernResults));
    });
  }

  function showAutocomplete(results, $field, group) {
    $field.parent().find('.hybrid-autocomplete').remove();

    var listStyle = 'position: absolute; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto; width: 100%; z-index: 1000; list-style: none; padding: 0; margin: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15);';

    if (!results || results.length === 0) {
      // Bei beschränkten Feldern einen Hinweis statt einer leeren Liste anzeigen
      if (group.restriction) {
        var $hintList = $('<ul class="hybrid-autocomplete"></ul>').attr('style', listStyle);
        var $hint = $('<li style="padding: 10px 12px; font-size: 13px; color: #666; font-style: italic; cursor: default;"></li>');
        $hint.text('Keine Treffer. ' + group.restriction.hint);
        $hintList.append($hint);
        $field.parent().css('position', 'relative');
        $field.parent().append($hintList);
      }
      return;
    }

    var $autocomplete = $('<ul class="hybrid-autocomplete"></ul>').attr('style', listStyle);

    results.slice(0, 10).forEach(function(result, index) {
      var displayText = result.strasse ?
        (result.strasse + ' ' + result.plz + ' ' + result.ort) :
        (result.plz + ' ' + result.ort);

      var sourceLabel = result.source === 'bayern' ? ' 🏔️' : ' 🇩🇪';

      // Text statt HTML: Treffer stammen von externen Diensten
      var $item = $('<li style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 14px;"></li>')
        .attr('data-index', index)
        .text(displayText + sourceLabel);

      $item.on('mouseenter', function() {
        $(this).css('background-color', '#f5f5f5');
      }).on('mouseleave', function() {
        $(this).css('background-color', 'white');
      });

      $item.on('click', function() {
        selectAddress(result, group);
        $autocomplete.remove();
      });

      $autocomplete.append($item);
    });

    $field.parent().css('position', 'relative');
    $field.parent().append($autocomplete);
  }

  function selectAddress(addressData, group) {
    log('Wähle Adresse: ' + addressData.vollstaendig + ' (Quelle: ' + addressData.source + ')', null, 'success');

    group.source = addressData.source;
    group.selectedStreet = addressData.strasse;

    if (group.hasStrasseField && group.strasse) {
      group.strasse.val(addressData.strasse);
      group.strasse.trigger('change');
    }

    group.plz.val(addressData.plz);
    group.ort.val(addressData.ort);
    group.suche.val(addressData.strasse);

    group.suche.parent().find('.hybrid-autocomplete').remove();

    group.plz.trigger('change');
    group.ort.trigger('change');
    group.suche.trigger('change');

    lockFields(group);

    if (addressData.source === 'openplz') {
      disableSearch(group);

      if (!hasHouseNumber(addressData.strasse)) {
        showFieldError(group.suche, CONFIG.VALIDATION.ERROR_MESSAGE);
        log('Hausnummer fehlt - Validierungsfehler angezeigt', null, 'debug');
      }
    } else {
      enableSearch(group);
      clearFieldError(group.suche);
    }
  }

  // ============================================================================
  // EVENT-HANDLING
  // ============================================================================

  function initializeSuchField(group) {
    var $field = group.suche;

    if ($field.data('hybrid-init')) {
      return;
    }

    $field.data('hybrid-init', true);
    log('Initialisiere Suchfeld: ' + group.id, null, 'debug');

    $field.on('input', function() {
      clearTimeout(group.debounceTimer);
      var value = $(this).val().trim();

      if (group.searchDisabled && group.source === 'openplz') {
        log('Suche deaktiviert - nur Hausnummer-Ergänzung erlaubt', null, 'debug');

        if (group.hasStrasseField && group.strasse) {
          group.strasse.val(value);
          group.strasse.trigger('change');
        }

        validateStreetField(group);

        $(this).parent().find('.hybrid-autocomplete').remove();

        return;
      }

      if (value.length < CONFIG.AUTOCOMPLETE_MIN_LENGTH) {
        $(this).parent().find('.hybrid-autocomplete').remove();
        return;
      }

      group.debounceTimer = setTimeout(function() {
        // Nur die Antwort der letzten Eingabe anzeigen
        var seq = ++group.requestSeq;
        hybridSearch(value, group, function(error, results) {
          if (!error && seq === group.requestSeq) {
            showAutocomplete(results, $field, group);
          }
        });
      }, CONFIG.DEBOUNCE_DELAY);
    });

    $field.on('blur', function() {
      if (group.source === 'openplz') {
        validateStreetField(group);
      }
    });

    $(document).on('click', function(e) {
      if (!$(e.target).closest('.hybrid-autocomplete').length &&
          !$(e.target).closest($field).length) {
        $field.parent().find('.hybrid-autocomplete').remove();
      }
    });

    $field.on('keydown', function(e) {
      if (e.keyCode === 27) {
        $(this).parent().find('.hybrid-autocomplete').remove();
      }
    });

    $field.on('change', function() {
      if (!$(this).val().trim()) {
        unlockFields(group);
        enableSearch(group);
        group.source = null;
        clearFieldError(group.suche);

        group.plz.val('');
        group.ort.val('');

        if (group.hasStrasseField && group.strasse) {
          group.strasse.val('');
          group.strasse.trigger('change');
        }

        group.plz.trigger('change');
        group.ort.trigger('change');
      }
    });

    // Bei Ortsbeschränkung auch manuell eingetragene PLZ prüfen
    if (group.restriction) {
      group.plz.on('change blur', function() {
        validatePLZRestriction(group);
      });
    }
  }

  // ============================================================================
  // MUTATION OBSERVER FÜR DYNAMISCHE ELEMENTE
  // ============================================================================

  function initializeNewFields() {
    var $suchFields = $('.' + CONFIG.FIELD_CLASSES.suche);
    var newFieldsCount = 0;

    $suchFields.each(function() {
      var $field = $(this);

      if ($field.data('hybrid-init')) {
        return;
      }

      var group = createFieldGroup($field);
      if (group) {
        fieldGroups.push(group);
        initializeSuchField(group);
        newFieldsCount++;
      }
    });

    if (newFieldsCount > 0) {
      log('Neue Felder initialisiert: ' + newFieldsCount, null, 'success');
    }
  }

  function startMutationObserver() {
    if (!CONFIG.OBSERVER.ENABLED) {
      log('MutationObserver ist deaktiviert', null, 'debug');
      return;
    }

    if (mutationObserver) {
      log('MutationObserver läuft bereits', null, 'debug');
      return;
    }

    mutationObserver = new MutationObserver(function(mutations) {
      var shouldReinitialize = false;

      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (var i = 0; i < mutation.addedNodes.length; i++) {
            var node = mutation.addedNodes[i];
            if (node.nodeType === Node.ELEMENT_NODE &&
                ($(node).hasClass(CONFIG.FIELD_CLASSES.suche) ||
                 $(node).find('.' + CONFIG.FIELD_CLASSES.suche).length > 0)) {
              shouldReinitialize = true;
            }
          }
        }
      });

      if (shouldReinitialize) {
        clearTimeout(observerDebounceTimer);
        observerDebounceTimer = setTimeout(function() {
          log('DOM-Änderung erkannt - initialisiere neue Felder...', null, 'debug');
          initializeNewFields();
        }, CONFIG.OBSERVER.DEBOUNCE_DELAY);
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    log('MutationObserver gestartet', null, 'debug');
  }

  function stopMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
      log('MutationObserver gestoppt', null, 'debug');
    }
  }

  // ============================================================================
  // INITIALISIERUNG
  // ============================================================================

  function initialize() {
    if (typeof window.$ !== 'function') {
      log('jQuery nicht gefunden – Adresssuche wird nicht gestartet', null, 'error');
      return;
    }

    applyPluginConfig();
    log('Initialisiere Hybrid Address Search (Plugin ' + PLUGIN_VERSION + ')', null, 'info');

    var $suchFields = $('.' + CONFIG.FIELD_CLASSES.suche);

    if ($suchFields.length === 0) {
      log('Keine Suchfelder gefunden - warte auf dynamische Elemente...', null, 'debug');
    } else {
      log('Gefundene Suchfelder: ' + $suchFields.length, null, 'debug');
      initializeNewFields();
      log('Initialisierung abgeschlossen. ' + fieldGroups.length + ' Feldgruppen aktiv', null, 'success');
    }

    startMutationObserver();
  }

  function reinitialize() {
    log('Manuelle Neuinitialisierung gestartet...', null, 'info');
    initializeNewFields();
  }

  // ============================================================================
  // ÖFFENTLICHE API (kompatibel zu V12)
  // ============================================================================

  window.HybridAddressSearch = {
    pluginVersion: PLUGIN_VERSION,
    initialize: initialize,
    reinitialize: reinitialize,
    initializeNewFields: initializeNewFields,
    startObserver: startMutationObserver,
    stopObserver: stopMutationObserver,
    config: CONFIG,
    log: log,
    analyzeInput: analyzeInput,
    isBayernPLZ: isBayernPLZ,
    isAllowedPLZ: isAllowedPLZ,
    hasHouseNumber: hasHouseNumber,
    validateStreetField: validateStreetField,
    validatePLZRestriction: validatePLZRestriction,
    getFieldGroups: function() { return fieldGroups; },
    getServletUrls: getServletUrls
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
