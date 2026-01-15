/**
 * Hybrid Adresssuche - Extended with Nominatim API
 * Bayern Ortssuchdienst + OpenPLZ + Nominatim Integration (V11.1-Nominatim)
 *
 * NEU in V11.1:
 * - Nominatim OSM API als zusätzliche Datenquelle
 * - Fallback-Mechanismus: Bayern → OpenPLZ → Nominatim
 * - Weltweite Adresssuche möglich
 * - Konfigurierbare API-Priorisierung
 *
 * Nominatim API Nutzungsbedingungen:
 * - Kostenlos für niedrige Request-Raten
 * - Max. 1 Request pro Sekunde
 * - User-Agent Header erforderlich
 * - Mehr Info: https://operations.osmfoundation.org/policies/nominatim/
 */

(function() {
  'use strict';

  // ============================================================================
  // KONFIGURATION
  // ============================================================================

  var CONFIG = {
    BAYERN_API: {
      BASE_URL: 'https://geoservices.bayern.de/services/ortssuche/v1',
      API_KEY: 'Hier API Key einfügen',
      ENABLED: true,
      PRIORITY: 1  // Höchste Priorität für Bayern-Adressen
    },

    OPENPLZ_API: {
      BASE_URL: 'https://openplzapi.org/de',
      ENABLED: true,
      PRIORITY: 2  // Zweite Priorität für deutsche Adressen
    },

    // NEU: Nominatim OSM API
    NOMINATIM_API: {
      BASE_URL: 'https://nominatim.openstreetmap.org',
      ENABLED: true,
      PRIORITY: 3,  // Fallback für alle anderen Adressen
      USER_AGENT: 'HybridAddressSearch/11.1',  // WICHTIG: Anpassen!
      RATE_LIMIT: 1000,  // Min. Millisekunden zwischen Requests (1 Sekunde)
      COUNTRY_CODE: 'de',  // Standard-Land (de = Deutschland)
      LANGUAGE: 'de',  // Antwort-Sprache
      // Optionen
      USE_FOR_BAYERN: false,  // Auch für Bayern-PLZ nutzen?
      USE_FOR_GERMANY: true,  // Für nicht-Bayern Deutsche PLZ nutzen?
      USE_AS_FALLBACK: true   // Als Fallback wenn andere APIs versagen?
    },

    FIELD_CLASSES: {
      suche: 'openplz-suche',
      plz: 'openplz-postalcode',
      ort: 'openplz-locality',
      strasse: 'openplz-street'
    },

    BAYERN_PLZ_RANGES: [
      { min: 80000, max: 87999 },
      { min: 90000, max: 97999 }
    ],

    VALIDATION: {
      STREET_WITH_NUMBER_REGEX: /^(([a-zA-ZäöüÄÖÜß]\D*)\s+\d+?\s*.*)$/,
      ERROR_MESSAGE: 'Bitte geben Sie eine gültige Schreibweise ein z.B. Am Plan 3c | Hauptstr. 4 1/2 | A-Weg 8'
    },

    STREET_ABBREVIATION: {
      ENABLED: true,
      APPLY_TO_BAYERN: true,
      APPLY_TO_OPENPLZ: false,
      APPLY_TO_NOMINATIM: false,  // NEU
      RULES: [
        { pattern: /straße(\s|$)/gi, replacement: 'str.$1' },
        { pattern: /Straße(\s|$)/g, replacement: 'Str.$1' },
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

    DEBUG: true
  };

  // ============================================================================
  // GLOBALE VARIABLEN
  // ============================================================================

  var debounceTimer = null;
  var observerDebounceTimer = null;
  var streetCache = {};
  var localityCache = {};
  var nominatimCache = {};  // NEU: Cache für Nominatim
  var fieldGroups = [];
  var mutationObserver = null;
  var lastNominatimRequest = 0;  // NEU: Rate Limiting für Nominatim

  // ============================================================================
  // HILFSFUNKTIONEN
  // ============================================================================

  function log(message, data, level) {
    level = level || 'info';
    if (!CONFIG.DEBUG && level === 'debug') return;

    var prefix = {
      'info': '✓',
      'debug': '🔍',
      'warn': '⚠️',
      'error': '❌',
      'success': '✅'
    }[level] || '•';

    console.log(prefix + ' [HybridSearch-Nominatim] ' + message, data || '');
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
    if (source === 'nominatim' && !CONFIG.STREET_ABBREVIATION.APPLY_TO_NOMINATIM) {
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
    var plainText = label.replace(/<[^>]+>/g, '');
    var boldMatches = label.match(/<b>([^<]+)<\/b>/g);
    var boldTexts = boldMatches ? boldMatches.map(function(m) {
      return m.replace(/<\/?b>/g, '');
    }) : [];
    var plzMatch = plainText.match(/\b(\d{5})\b/);
    var plz = plzMatch ? plzMatch[1] : '';

    return {
      plainText: plainText,
      boldTexts: boldTexts,
      plz: plz
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

  // ============================================================================
  // NOMINATIM API FUNKTIONEN (NEU)
  // ============================================================================

  /**
   * Rate Limiting für Nominatim (max 1 Request/Sekunde)
   */
  function nominatimRateLimitWait(callback) {
    var now = Date.now();
    var timeSinceLastRequest = now - lastNominatimRequest;

    if (timeSinceLastRequest < CONFIG.NOMINATIM_API.RATE_LIMIT) {
      var waitTime = CONFIG.NOMINATIM_API.RATE_LIMIT - timeSinceLastRequest;
      log('Nominatim Rate Limit: Warte ' + waitTime + 'ms', null, 'debug');
      setTimeout(callback, waitTime);
    } else {
      callback();
    }
  }

  /**
   * Sucht Adressen über Nominatim OSM API
   */
  function searchNominatimAPI(suchbegriff, callback) {
    if (!CONFIG.NOMINATIM_API.ENABLED) {
      callback(null, []);
      return;
    }

    var cacheKey = 'nominatim_' + suchbegriff.toLowerCase();

    if (nominatimCache[cacheKey]) {
      log('Nominatim aus Cache: ' + suchbegriff, null, 'debug');
      callback(null, nominatimCache[cacheKey]);
      return;
    }

    log('Nominatim API Suche: ' + suchbegriff, null, 'debug');

    nominatimRateLimitWait(function() {
      lastNominatimRequest = Date.now();

      $.ajax({
        url: CONFIG.NOMINATIM_API.BASE_URL + '/search',
        method: 'GET',
        dataType: 'json',
        data: {
          q: suchbegriff,
          format: 'json',
          addressdetails: 1,
          countrycodes: CONFIG.NOMINATIM_API.COUNTRY_CODE,
          'accept-language': CONFIG.NOMINATIM_API.LANGUAGE,
          limit: 10
        },
        headers: {
          'User-Agent': CONFIG.NOMINATIM_API.USER_AGENT
        },
        timeout: 5000,
        success: function(data) {
          if (data && Array.isArray(data) && data.length > 0) {
            log('Nominatim API: ' + data.length + ' Ergebnisse', null, 'success');
            nominatimCache[cacheKey] = data;
            callback(null, data);
          } else {
            callback(null, []);
          }
        },
        error: function(xhr, status, error) {
          log('Nominatim API Fehler: ' + error, null, 'error');
          callback(error, []);
        }
      });
    });
  }

  /**
   * Extrahiert Adressdaten aus Nominatim-Antwort
   */
  function extractNominatimAddressData(result) {
    if (!result || !result.address) {
      return null;
    }

    var addr = result.address;

    // Straße extrahieren (verschiedene Formate möglich)
    var strasse = addr.road || addr.street || addr.pedestrian || addr.path || '';
    var hausnummer = addr.house_number || '';
    if (hausnummer && strasse) {
      strasse = strasse + ' ' + hausnummer;
    }

    // PLZ und Ort
    var plz = addr.postcode || '';
    var ort = addr.city || addr.town || addr.village || addr.municipality || '';

    var data = {
      strasse: strasse,
      plz: plz,
      ort: ort,
      vollstaendig: result.display_name || '',
      source: 'nominatim',
      lat: result.lat || null,
      lon: result.lon || null,
      osm_type: result.osm_type || null,
      osm_id: result.osm_id || null
    };

    // Wende Straßennamen-Kürzung an
    data.strasse = abbreviateStreetName(data.strasse, 'nominatim');

    return data;
  }

  // ============================================================================
  // EXISTIERENDE API-FUNKTIONEN (Bayern, OpenPLZ)
  // ============================================================================

  // [... Hier bleiben alle existierenden Funktionen ...]
  // searchBayernAPI, extractBayernAddressData, loadStreetsForPostalCode, etc.
  // (Der Einfachheit halber nicht wiederholt - siehe Original-Script)

  // Für die Demo füge ich hier Platzhalter ein:

  function searchBayernAPI(suchbegriff, callback) {
    // ... (Original Code)
    log('Bayern API würde hier suchen: ' + suchbegriff, null, 'debug');
    callback(null, []); // Platzhalter
  }

  function extractBayernAddressData(result) {
    // ... (Original Code)
    return null; // Platzhalter
  }

  function loadStreetsForPostalCode(postalCode, callback) {
    // ... (Original Code)
    log('OpenPLZ würde hier laden: ' + postalCode, null, 'debug');
    callback(null, []); // Platzhalter
  }

  function extractOpenPLZAddressData(street) {
    // ... (Original Code)
    return null; // Platzhalter
  }

  // ============================================================================
  // HYBRID SEARCH MIT NOMINATIM (ERWEITERT)
  // ============================================================================

  /**
   * Erweiterte Hybrid-Suche mit Nominatim als zusätzliche Quelle
   */
  function hybridSearchWithNominatim(suchbegriff, group, callback) {
    log('Starte erweiterte Hybrid-Suche (mit Nominatim): ' + suchbegriff, null, 'info');

    var inputAnalysis = analyzeInput(suchbegriff);
    log('Eingabetyp: ' + inputAnalysis.description, null, 'debug');

    var combinedResults = [];
    var apiCallsCompleted = 0;
    var totalAPIsToCall = 0;

    // Bestimme welche APIs aufgerufen werden sollen
    var callBayern = false;
    var callOpenPLZ = false;
    var callNominatim = false;

    if (inputAnalysis.type === 'postalcode_only') {
      if (inputAnalysis.isBayern && CONFIG.BAYERN_API.ENABLED) {
        callBayern = true;
        totalAPIsToCall++;
      }
      if (CONFIG.OPENPLZ_API.ENABLED) {
        callOpenPLZ = true;
        totalAPIsToCall++;
      }
      if (CONFIG.NOMINATIM_API.ENABLED && CONFIG.NOMINATIM_API.USE_AS_FALLBACK) {
        callNominatim = true;
        totalAPIsToCall++;
      }
    } else if (inputAnalysis.type === 'with_postalcode') {
      if (inputAnalysis.isBayern && CONFIG.BAYERN_API.ENABLED) {
        callBayern = true;
        totalAPIsToCall++;
      } else if (CONFIG.OPENPLZ_API.ENABLED) {
        callOpenPLZ = true;
        totalAPIsToCall++;
      }

      if (CONFIG.NOMINATIM_API.ENABLED && CONFIG.NOMINATIM_API.USE_FOR_GERMANY) {
        callNominatim = true;
        totalAPIsToCall++;
      }
    } else {
      // Keine PLZ erkannt
      if (CONFIG.BAYERN_API.ENABLED) {
        callBayern = true;
        totalAPIsToCall++;
      }
      if (CONFIG.NOMINATIM_API.ENABLED && CONFIG.NOMINATIM_API.USE_AS_FALLBACK) {
        callNominatim = true;
        totalAPIsToCall++;
      }
    }

    function checkAllCompleted() {
      apiCallsCompleted++;
      if (apiCallsCompleted >= totalAPIsToCall) {
        // Entferne Duplikate basierend auf Adresse
        var uniqueResults = [];
        var seen = {};

        combinedResults.forEach(function(result) {
          var key = (result.strasse + result.plz + result.ort).toLowerCase();
          if (!seen[key]) {
            seen[key] = true;
            uniqueResults.push(result);
          }
        });

        log('Gesamt-Ergebnisse: ' + uniqueResults.length + ' (aus ' + totalAPIsToCall + ' APIs)', null, 'success');
        callback(null, uniqueResults);
      }
    }

    // Bayern API aufrufen
    if (callBayern) {
      searchBayernAPI(suchbegriff, function(error, bayernResults) {
        if (!error && bayernResults && bayernResults.length > 0) {
          var results = bayernResults.map(extractBayernAddressData).filter(function(item) {
            return item !== null;
          });
          combinedResults = combinedResults.concat(results);
        }
        checkAllCompleted();
      });
    }

    // OpenPLZ API aufrufen
    if (callOpenPLZ && inputAnalysis.plz) {
      loadStreetsForPostalCode(inputAnalysis.plz, function(error, streets) {
        if (!error && streets && streets.length > 0) {
          var results = streets.map(extractOpenPLZAddressData).filter(function(item) {
            return item !== null && item.strasse;
          });
          combinedResults = combinedResults.concat(results);
        }
        checkAllCompleted();
      });
    }

    // Nominatim API aufrufen
    if (callNominatim) {
      searchNominatimAPI(suchbegriff, function(error, nominatimResults) {
        if (!error && nominatimResults && nominatimResults.length > 0) {
          var results = nominatimResults.map(extractNominatimAddressData).filter(function(item) {
            return item !== null;
          });
          combinedResults = combinedResults.concat(results);
        }
        checkAllCompleted();
      });
    }

    // Falls keine APIs aktiviert sind
    if (totalAPIsToCall === 0) {
      log('Keine APIs aktiviert!', null, 'warn');
      callback(null, []);
    }
  }

  // ============================================================================
  // AUTOCOMPLETE MIT SOURCE-KENNZEICHNUNG
  // ============================================================================

  function showAutocompleteWithNominatim(results, $field, group) {
    $field.parent().find('.hybrid-autocomplete').remove();

    if (!results || results.length === 0) return;

    var $autocomplete = $('<ul class="hybrid-autocomplete" style="position: absolute; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto; width: 100%; z-index: 1000; list-style: none; padding: 0; margin: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15);"></ul>');

    results.slice(0, 10).forEach(function(result, index) {
      var displayText = result.strasse ?
        (result.strasse + ' ' + result.plz + ' ' + result.ort) :
        (result.plz + ' ' + result.ort);

      // Source-Icon
      var sourceLabel = '';
      if (result.source === 'bayern') sourceLabel = ' 🏔️';
      else if (result.source === 'openplz') sourceLabel = ' 🇩🇪';
      else if (result.source === 'nominatim') sourceLabel = ' 🌍';  // NEU

      var $item = $('<li style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 14px;" data-index="' + index + '">' + displayText + sourceLabel + '</li>');

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

  // ============================================================================
  // ÖFFENTLICHE API
  // ============================================================================

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

    // ... Rest der Funktion (lockFields etc.)
  }

  // [... Weitere Funktionen wie im Original ...]

  function initialize() {
    log('Initialisiere Hybrid Address Search v11.1-Nominatim (mit OSM Integration)', null, 'info');
    // ... Initialisierung
  }

  window.HybridAddressSearchNominatim = {
    initialize: initialize,
    config: CONFIG,
    searchNominatim: searchNominatimAPI,
    hybridSearch: hybridSearchWithNominatim,
    log: log,
    analyzeInput: analyzeInput,
    isBayernPLZ: isBayernPLZ
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
