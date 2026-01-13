/**
 * Hybrid Adresssuche - Bayern Ortssuchdienst + OpenPLZ Integration (V11)
 *
 * NEU in V11:
 * - openplz-street Klasse ist jetzt optional (Formulare ohne separates Straßenfeld)
 *
 * NEU in V10:
 * - Automatische Kürzung von "Straße" zu "Str." bei Bayern-Adressen (LBDV-Kompatibilität)
 *
 * NEU in V9:
 * - MutationObserver für dynamisch hinzugefügte Elemente (wiederholbare Container)
 * - reinitialize() Funktion für manuelle Neuinitialisierung
 * - Automatische Erkennung neuer Suchfelder im DOM
 *
 * Version: 11.0 - Optionales Straßenfeld (openplz-street)
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
      ENABLED: true,           // Kürzung aktivieren/deaktivieren
      APPLY_TO_BAYERN: true,   // Nur bei Bayern-Adressen anwenden
      APPLY_TO_OPENPLZ: false, // Bei OpenPLZ-Adressen anwenden
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

    // MutationObserver Einstellungen
    OBSERVER: {
      ENABLED: true,
      DEBOUNCE_DELAY: 100  // Verzögerung bevor neue Elemente initialisiert werden
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
  var fieldGroups = [];
  var mutationObserver = null;

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

    console.log(prefix + ' [HybridSearch] ' + message, data || '');
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

  /**
   * Kürzt Straßennamen gemäß LBDV-Konvention
   * z.B. "Herrenstraße 7" -> "Herrenstr. 7"
   */
  function abbreviateStreetName(streetName, source) {
    if (!CONFIG.STREET_ABBREVIATION.ENABLED) {
      return streetName;
    }

    // Prüfe ob Kürzung für diese Quelle aktiviert ist
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

    // Pflichtfelder: suche, plz, ort
    // Optional: strasse
    if ($plzField.length === 0 || $ortField.length === 0) {
      log('Unvollständige Feldgruppe für: ' + suchId + ' (PLZ oder Ort fehlt)', null, 'warn');
      return null;
    }

    // Hinweis wenn strasse-Feld fehlt
    if ($strasseField.length === 0) {
      log('Feldgruppe ' + suchId + ': openplz-street nicht vorhanden (optional)', null, 'debug');
    }

    var group = {
      suche: $suchField,
      plz: $plzField,
      ort: $ortField,
      strasse: $strasseField.length > 0 ? $strasseField : null,  // Optional!
      hasStrasseField: $strasseField.length > 0,
      id: suchId,
      source: null,
      isLocked: false,
      searchDisabled: false,
      selectedStreet: null
    };

    log('Feldgruppe erstellt: ' + suchId + (group.hasStrasseField ? ' (mit Straßenfeld)' : ' (ohne Straßenfeld)'), null, 'success');
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

    log('Fehlermeldung angezeigt: ' + message, null, 'warn');
  }

  function clearFieldError($field) {
    $field.next('.hybrid-field-error').remove();
    $field.css('border-color', '');
  }

  function lockFields(group) {
    if (group.isLocked) return;

    group.plz.prop('readonly', true);
    group.ort.prop('readonly', true);

    group.plz.css({
      'background-color': '#f5f5f5',
      'cursor': 'not-allowed'
    });
    group.ort.css({
      'background-color': '#f5f5f5',
      'cursor': 'not-allowed'
    });

    group.isLocked = true;
    log('PLZ/Ort Felder gesperrt für Gruppe: ' + group.id, null, 'debug');
  }

  function unlockFields(group) {
    if (!group.isLocked) return;

    group.plz.prop('readonly', false);
    group.ort.prop('readonly', false);

    group.plz.css({
      'background-color': '',
      'cursor': ''
    });
    group.ort.css({
      'background-color': '',
      'cursor': ''
    });

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

  // ============================================================================
  // BAYERN API FUNKTIONEN
  // ============================================================================

  function searchBayernAPI(suchbegriff, callback) {
    if (!CONFIG.BAYERN_API.ENABLED) {
      callback(null, []);
      return;
    }

    log('Bayern API Suche: ' + suchbegriff, null, 'debug');

    $.ajax({
      url: CONFIG.BAYERN_API.BASE_URL + '/adressen/' + encodeURIComponent(suchbegriff),
      method: 'GET',
      dataType: 'json',
      data: {
        filter: 'address',
        srid: '31468',
        fuzzy: 'false',
        api_key: CONFIG.BAYERN_API.API_KEY
      },
      timeout: 5000,
      success: function(data) {
        if (data && data.results && Array.isArray(data.results) && data.results.length > 0) {
          log('Bayern API: ' + data.results.length + ' Ergebnisse', null, 'success');
          callback(null, data.results);
        } else {
          callback(null, []);
        }
      },
      error: function(xhr, status, error) {
        log('Bayern API Fehler: ' + error, null, 'error');
        callback(error, []);
      }
    });
  }

  function extractBayernAddressData(result) {
    if (!result || !result.attrs || !result.attrs.label) {
      return null;
    }

    var parsed = parseLabel(result.attrs.label);
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

    // Wende Straßennamen-Kürzung an (LBDV-Kompatibilität)
    data.strasse = abbreviateStreetName(data.strasse, 'bayern');
    data.vollstaendig = abbreviateStreetName(data.vollstaendig, 'bayern');

    return data;
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

    var data = {
      strasse: strasseName,
      plz: plz,
      ort: ort,
      vollstaendig: strasseName + ' ' + plz + ' ' + ort,
      source: 'openplz'
    };

    return data;
  }

  // ============================================================================
  // HYBRID SEARCH LOGIK
  // ============================================================================

  function hybridSearch(suchbegriff, group, callback) {
    log('Starte Hybrid-Suche für: ' + suchbegriff, null, 'info');

    var inputAnalysis = analyzeInput(suchbegriff);
    log('Eingabetyp: ' + inputAnalysis.description, null, 'debug');

    if (inputAnalysis.type === 'postalcode_only') {
      log('→ Nur PLZ erkannt: Lade Straßen von OpenPLZ', null, 'info');

      loadStreetsForPostalCode(inputAnalysis.plz, function(error, streets) {
        if (!error && streets && streets.length > 0) {
          var results = streets.map(function(street) {
            return extractOpenPLZAddressData(street);
          }).filter(function(item) {
            return item !== null && item.strasse;
          });

          callback(null, results);
        } else {
          callback(null, []);
        }
      });
      return;
    }

    if (inputAnalysis.type === 'with_postalcode' && inputAnalysis.plz) {

      if (!inputAnalysis.isBayern) {
        log('→ Nicht-bayerische PLZ erkannt (' + inputAnalysis.plz + '): Wechsle zu OpenPLZ', null, 'info');

        loadStreetsForPostalCode(inputAnalysis.plz, function(error, streets) {
          if (!error && streets && streets.length > 0) {
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

            var results = filteredStreets.map(function(street) {
              return extractOpenPLZAddressData(street);
            }).filter(function(item) {
              return item !== null && item.strasse;
            });

            callback(null, results);
          } else {
            callback(null, []);
          }
        });
        return;
      }

      log('→ Bayerische PLZ erkannt (' + inputAnalysis.plz + '): Suche in Bayern API', null, 'info');
      searchBayernAPI(suchbegriff, function(error, bayernResults) {
        if (!error && bayernResults && bayernResults.length > 0) {
          var results = bayernResults.map(function(result) {
            return extractBayernAddressData(result);
          }).filter(function(item) {
            return item !== null;
          });

          callback(null, results);
        } else {
          callback(null, []);
        }
      });
      return;
    }

    log('→ Keine PLZ erkannt: Suche in Bayern API (Standard)', null, 'info');

    searchBayernAPI(suchbegriff, function(error, bayernResults) {
      if (!error && bayernResults && bayernResults.length > 0) {
        var results = bayernResults.map(function(result) {
          return extractBayernAddressData(result);
        }).filter(function(item) {
          return item !== null;
        });

        callback(null, results);
      } else {
        callback(null, []);
      }
    });
  }

  function showAutocomplete(results, $field, group) {
    $field.parent().find('.hybrid-autocomplete').remove();

    if (!results || results.length === 0) {
      return;
    }

    var $autocomplete = $('<ul class="hybrid-autocomplete" style="position: absolute; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto; width: 100%; z-index: 1000; list-style: none; padding: 0; margin: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15);"></ul>');

    results.slice(0, 10).forEach(function(result, index) {
      var displayText = result.strasse ?
        (result.strasse + ' ' + result.plz + ' ' + result.ort) :
        (result.plz + ' ' + result.ort);

      var sourceLabel = result.source === 'bayern' ? ' 🏔️' : ' 🇩🇪';

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

  function selectAddress(addressData, group) {
    log('Wähle Adresse: ' + addressData.vollstaendig + ' (Quelle: ' + addressData.source + ')', null, 'success');

    group.source = addressData.source;
    group.selectedStreet = addressData.strasse;

    // Straßenfeld nur setzen wenn vorhanden (optional)
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
        log('Hausnummer fehlt - Validierungsfehler angezeigt', null, 'warn');
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
      clearTimeout(debounceTimer);
      var value = $(this).val().trim();

      if (group.searchDisabled && group.source === 'openplz') {
        log('Suche deaktiviert - nur Hausnummer-Ergänzung erlaubt', null, 'debug');

        // Straßenfeld nur setzen wenn vorhanden (optional)
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

      debounceTimer = setTimeout(function() {
        hybridSearch(value, group, function(error, results) {
          if (!error) {
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

        // Straßenfeld nur leeren wenn vorhanden (optional)
        if (group.hasStrasseField && group.strasse) {
          group.strasse.val('');
          group.strasse.trigger('change');
        }

        group.plz.trigger('change');
        group.ort.trigger('change');
      }
    });
  }

  // ============================================================================
  // MUTATION OBSERVER FÜR DYNAMISCHE ELEMENTE
  // ============================================================================

  /**
   * Initialisiert neue Suchfelder, die noch nicht initialisiert wurden
   */
  function initializeNewFields() {
    var $suchFields = $('.' + CONFIG.FIELD_CLASSES.suche);
    var newFieldsCount = 0;

    $suchFields.each(function() {
      var $field = $(this);

      // Prüfe ob bereits initialisiert
      if ($field.data('hybrid-init')) {
        return; // Skip
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

  /**
   * Startet den MutationObserver für dynamische DOM-Änderungen
   */
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
          // Prüfe ob neue Knoten relevante Klassen enthalten
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Prüfe ob das Element selbst oder seine Kinder Suchfelder sind
              if ($(node).hasClass(CONFIG.FIELD_CLASSES.suche) ||
                  $(node).find('.' + CONFIG.FIELD_CLASSES.suche).length > 0) {
                shouldReinitialize = true;
              }
            }
          });
        }
      });

      if (shouldReinitialize) {
        // Debounce die Reinitialisierung
        clearTimeout(observerDebounceTimer);
        observerDebounceTimer = setTimeout(function() {
          log('DOM-Änderung erkannt - initialisiere neue Felder...', null, 'debug');
          initializeNewFields();
        }, CONFIG.OBSERVER.DEBOUNCE_DELAY);
      }
    });

    // Beobachte das gesamte Dokument auf Änderungen
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    log('MutationObserver gestartet', null, 'debug');
  }

  /**
   * Stoppt den MutationObserver
   */
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

  /**
   * Initialisiert alle Feldgruppen
   */
  function initialize() {
    log('Initialisiere Hybrid Address Search v11.0 (Optionales Straßenfeld)', null, 'info');

    var $suchFields = $('.' + CONFIG.FIELD_CLASSES.suche);

    if ($suchFields.length === 0) {
      log('Keine Suchfelder gefunden - warte auf dynamische Elemente...', null, 'warn');
    } else {
      log('Gefundene Suchfelder: ' + $suchFields.length, null, 'debug');

      $suchFields.each(function() {
        var group = createFieldGroup($(this));
        if (group) {
          fieldGroups.push(group);
          initializeSuchField(group);
        }
      });

      log('Initialisierung abgeschlossen. ' + fieldGroups.length + ' Feldgruppen aktiv', null, 'success');
    }

    // Starte MutationObserver für dynamische Elemente
    startMutationObserver();
  }

  /**
   * Öffentliche Funktion zur manuellen Neuinitialisierung
   * Kann aufgerufen werden, wenn neue Elemente dynamisch hinzugefügt wurden
   */
  function reinitialize() {
    log('Manuelle Neuinitialisierung gestartet...', null, 'info');
    initializeNewFields();
  }

  // ============================================================================
  // ÖFFENTLICHE API
  // ============================================================================

  window.HybridAddressSearch = {
    initialize: initialize,
    reinitialize: reinitialize,
    initializeNewFields: initializeNewFields,
    startObserver: startMutationObserver,
    stopObserver: stopMutationObserver,
    config: CONFIG,
    log: log,
    analyzeInput: analyzeInput,
    isBayernPLZ: isBayernPLZ,
    hasHouseNumber: hasHouseNumber,
    validateStreetField: validateStreetField,
    getFieldGroups: function() { return fieldGroups; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
