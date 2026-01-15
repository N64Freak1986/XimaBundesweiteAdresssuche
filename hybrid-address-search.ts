/**
 * Hybrid Adresssuche - TypeScript Version
 * Bayern Ortssuchdienst + OpenPLZ Integration (V11.0-TS)
 *
 * TypeScript-Version mit vollständigen Type Definitions
 */

/// <reference types="jquery" />

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface BayernAPIConfig {
  BASE_URL: string;
  API_KEY: string;
  ENABLED: boolean;
}

interface OpenPLZAPIConfig {
  BASE_URL: string;
  ENABLED: boolean;
}

interface FieldClasses {
  suche: string;
  plz: string;
  ort: string;
  strasse: string;
}

interface PLZRange {
  min: number;
  max: number;
}

interface StreetAbbreviationRule {
  pattern: RegExp;
  replacement: string;
}

interface StreetAbbreviationConfig {
  ENABLED: boolean;
  APPLY_TO_BAYERN: boolean;
  APPLY_TO_OPENPLZ: boolean;
  RULES: StreetAbbreviationRule[];
}

interface ValidationConfig {
  STREET_WITH_NUMBER_REGEX: RegExp;
  ERROR_MESSAGE: string;
}

interface ObserverConfig {
  ENABLED: boolean;
  DEBOUNCE_DELAY: number;
}

interface Config {
  BAYERN_API: BayernAPIConfig;
  OPENPLZ_API: OpenPLZAPIConfig;
  FIELD_CLASSES: FieldClasses;
  BAYERN_PLZ_RANGES: PLZRange[];
  VALIDATION: ValidationConfig;
  STREET_ABBREVIATION: StreetAbbreviationConfig;
  DEBOUNCE_DELAY: number;
  AUTOCOMPLETE_MIN_LENGTH: number;
  PAGE_SIZE: number;
  MAX_PAGES: number;
  OBSERVER: ObserverConfig;
  DEBUG: boolean;
}

interface FieldGroup {
  suche: JQuery<HTMLElement>;
  plz: JQuery<HTMLElement>;
  ort: JQuery<HTMLElement>;
  strasse: JQuery<HTMLElement> | null;
  hasStrasseField: boolean;
  id: string;
  source: 'bayern' | 'openplz' | null;
  isLocked: boolean;
  searchDisabled: boolean;
  selectedStreet: string | null;
}

interface AddressData {
  strasse: string;
  plz: string;
  ort: string;
  vollstaendig: string;
  source: 'bayern' | 'openplz';
}

interface BayernAPIResult {
  attrs: {
    label: string;
  };
}

interface BayernAPIResponse {
  results: BayernAPIResult[];
}

interface OpenPLZStreet {
  name: string;
  postalCode: string;
  locality: string;
}

interface ParsedLabel {
  plainText: string;
  boldTexts: string[];
  plz: string;
}

interface InputAnalysis {
  type: 'postalcode_only' | 'with_postalcode' | 'street_with_number' | 'street_or_city' | 'mixed';
  value: string;
  plz: string | null;
  isBayern: boolean | null;
  description: string;
}

type LogLevel = 'info' | 'debug' | 'warn' | 'error' | 'success';

interface HybridAddressSearchAPI {
  initialize: () => void;
  reinitialize: () => void;
  initializeNewFields: () => void;
  startObserver: () => void;
  stopObserver: () => void;
  config: Config;
  log: (message: string, data?: any, level?: LogLevel) => void;
  analyzeInput: (input: string) => InputAnalysis;
  isBayernPLZ: (plz: string) => boolean;
  hasHouseNumber: (streetInput: string) => boolean;
  validateStreetField: (group: FieldGroup) => boolean;
  getFieldGroups: () => FieldGroup[];
}

// ============================================================================
// MAIN IMPLEMENTATION
// ============================================================================

(function(): void {
  'use strict';

  // ============================================================================
  // KONFIGURATION
  // ============================================================================

  const CONFIG: Config = {
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

    STREET_ABBREVIATION: {
      ENABLED: true,
      APPLY_TO_BAYERN: true,
      APPLY_TO_OPENPLZ: false,
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

  let debounceTimer: number | null = null;
  let observerDebounceTimer: number | null = null;
  const streetCache: Record<string, OpenPLZStreet[]> = {};
  const localityCache: Record<string, any> = {};
  const fieldGroups: FieldGroup[] = [];
  let mutationObserver: MutationObserver | null = null;

  // ============================================================================
  // HILFSFUNKTIONEN
  // ============================================================================

  function log(message: string, data?: any, level: LogLevel = 'info'): void {
    if (!CONFIG.DEBUG && level === 'debug') return;

    const prefixMap: Record<LogLevel, string> = {
      'info': '✓',
      'debug': '🔍',
      'warn': '⚠️',
      'error': '❌',
      'success': '✅'
    };

    const prefix = prefixMap[level] || '•';
    console.log(`${prefix} [HybridSearch] ${message}`, data || '');
  }

  function isBayernPLZ(plz: string): boolean {
    const plzNum = parseInt(plz, 10);
    if (isNaN(plzNum)) return false;

    return CONFIG.BAYERN_PLZ_RANGES.some(range =>
      plzNum >= range.min && plzNum <= range.max
    );
  }

  function extractPLZ(suchbegriff: string): string | null {
    const match = suchbegriff.match(/\b(\d{5})\b/);
    return match ? match[1] : null;
  }

  function hasHouseNumber(streetInput: string): boolean {
    return CONFIG.VALIDATION.STREET_WITH_NUMBER_REGEX.test(streetInput.trim());
  }

  function abbreviateStreetName(streetName: string, source: 'bayern' | 'openplz'): string {
    if (!CONFIG.STREET_ABBREVIATION.ENABLED) {
      return streetName;
    }

    if (source === 'bayern' && !CONFIG.STREET_ABBREVIATION.APPLY_TO_BAYERN) {
      return streetName;
    }
    if (source === 'openplz' && !CONFIG.STREET_ABBREVIATION.APPLY_TO_OPENPLZ) {
      return streetName;
    }

    let result = streetName;
    CONFIG.STREET_ABBREVIATION.RULES.forEach(rule => {
      result = result.replace(rule.pattern, rule.replacement);
    });

    if (result !== streetName) {
      log(`Straßenname gekürzt: "${streetName}" -> "${result}"`, null, 'debug');
    }

    return result;
  }

  function parseLabel(label: string): ParsedLabel {
    const plainText = label.replace(/<[^>]+>/g, '');
    const boldMatches = label.match(/<b>([^<]+)<\/b>/g);
    const boldTexts = boldMatches ? boldMatches.map(m => m.replace(/<\/?b>/g, '')) : [];
    const plzMatch = plainText.match(/\b(\d{5})\b/);
    const plz = plzMatch ? plzMatch[1] : '';

    return { plainText, boldTexts, plz };
  }

  function analyzeInput(input: string): InputAnalysis {
    const trimmed = input.trim();
    const plz = extractPLZ(trimmed);

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
        plz,
        isBayern: isBayernPLZ(plz),
        description: `Text mit PLZ ${plz} ${isBayernPLZ(plz) ? '(Bayern)' : '(nicht Bayern)'}`
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

  function findNextFieldWithClass($startElement: JQuery<HTMLElement>, className: string): JQuery<HTMLElement> {
    const $siblings = $startElement.nextAll(`.${className}:first`);
    if ($siblings.length > 0) return $siblings;

    const $parent = $startElement.parent();
    const $inParent = $parent.find(`.${className}`).not($startElement);
    if ($inParent.length > 0) return $inParent.first();

    const $nextContainers = $parent.nextAll();
    for (let i = 0; i < $nextContainers.length; i++) {
      const $found = $($nextContainers[i]).find(`.${className}:first`);
      if ($found.length > 0) return $found;
    }

    const $containerBlock = $startElement.closest('[id*="_c_"]');
    if ($containerBlock.length > 0) {
      const $inContainer = $containerBlock.find(`.${className}`).not($startElement);
      if ($inContainer.length > 0) return $inContainer.first();
    }

    const allSuchFields = $(`.${CONFIG.FIELD_CLASSES.suche}`);
    const suchIndex = allSuchFields.index($startElement);

    if (suchIndex >= 0) {
      const allTargetFields = $(`.${className}`);
      if (suchIndex < allTargetFields.length) {
        return allTargetFields.eq(suchIndex);
      }
    }

    return $();
  }

  function createFieldGroup($suchField: JQuery<HTMLElement>): FieldGroup | null {
    const suchId = $suchField.attr('id') || $suchField.attr('name') || 'unknown';
    log(`Erstelle Feldgruppe für: ${suchId}`, null, 'debug');

    const $plzField = findNextFieldWithClass($suchField, CONFIG.FIELD_CLASSES.plz);
    const $ortField = findNextFieldWithClass($suchField, CONFIG.FIELD_CLASSES.ort);
    const $strasseField = findNextFieldWithClass($suchField, CONFIG.FIELD_CLASSES.strasse);

    if ($plzField.length === 0 || $ortField.length === 0) {
      log(`Unvollständige Feldgruppe für: ${suchId} (PLZ oder Ort fehlt)`, null, 'warn');
      return null;
    }

    if ($strasseField.length === 0) {
      log(`Feldgruppe ${suchId}: openplz-street nicht vorhanden (optional)`, null, 'debug');
    }

    const group: FieldGroup = {
      suche: $suchField,
      plz: $plzField,
      ort: $ortField,
      strasse: $strasseField.length > 0 ? $strasseField : null,
      hasStrasseField: $strasseField.length > 0,
      id: suchId,
      source: null,
      isLocked: false,
      searchDisabled: false,
      selectedStreet: null
    };

    log(`Feldgruppe erstellt: ${suchId} ${group.hasStrasseField ? '(mit Straßenfeld)' : '(ohne Straßenfeld)'}`, null, 'success');
    return group;
  }

  // ============================================================================
  // VALIDIERUNG UND FEHLERMELDUNGEN
  // ============================================================================

  function showFieldError($field: JQuery<HTMLElement>, message: string): void {
    clearFieldError($field);

    const $error = $('<div class="hybrid-field-error" style="color: #d32f2f; font-size: 12px; margin-top: 4px; padding: 4px 8px; background: #ffebee; border-radius: 4px; border-left: 3px solid #d32f2f;"></div>');
    $error.text(message);

    $field.after($error);
    $field.css('border-color', '#d32f2f');

    log(`Fehlermeldung angezeigt: ${message}`, null, 'warn');
  }

  function clearFieldError($field: JQuery<HTMLElement>): void {
    $field.next('.hybrid-field-error').remove();
    $field.css('border-color', '');
  }

  function lockFields(group: FieldGroup): void {
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
    log(`PLZ/Ort Felder gesperrt für Gruppe: ${group.id}`, null, 'debug');
  }

  function unlockFields(group: FieldGroup): void {
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
    log(`PLZ/Ort Felder entsperrt für Gruppe: ${group.id}`, null, 'debug');
  }

  function disableSearch(group: FieldGroup): void {
    group.searchDisabled = true;
    log(`Suche deaktiviert für Gruppe: ${group.id}`, null, 'debug');
  }

  function enableSearch(group: FieldGroup): void {
    group.searchDisabled = false;
    group.selectedStreet = null;
    log(`Suche aktiviert für Gruppe: ${group.id}`, null, 'debug');
  }

  function validateStreetField(group: FieldGroup): boolean {
    if (group.source !== 'openplz') {
      clearFieldError(group.suche);
      return true;
    }

    const value = group.suche.val() as string;
    if (!value || !value.trim()) {
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

  function searchBayernAPI(
    suchbegriff: string,
    callback: (error: any, results: BayernAPIResult[]) => void
  ): void {
    if (!CONFIG.BAYERN_API.ENABLED) {
      callback(null, []);
      return;
    }

    log(`Bayern API Suche: ${suchbegriff}`, null, 'debug');

    $.ajax({
      url: `${CONFIG.BAYERN_API.BASE_URL}/adressen/${encodeURIComponent(suchbegriff)}`,
      method: 'GET',
      dataType: 'json',
      data: {
        filter: 'address',
        srid: '31468',
        fuzzy: 'false',
        api_key: CONFIG.BAYERN_API.API_KEY
      },
      timeout: 5000,
      success: (data: BayernAPIResponse) => {
        if (data?.results && Array.isArray(data.results) && data.results.length > 0) {
          log(`Bayern API: ${data.results.length} Ergebnisse`, null, 'success');
          callback(null, data.results);
        } else {
          callback(null, []);
        }
      },
      error: (xhr, status, error) => {
        log(`Bayern API Fehler: ${error}`, null, 'error');
        callback(error, []);
      }
    });
  }

  function extractBayernAddressData(result: BayernAPIResult): AddressData | null {
    if (!result?.attrs?.label) return null;

    const parsed = parseLabel(result.attrs.label);
    const plain = parsed.plainText;

    const data: AddressData = {
      strasse: '',
      plz: parsed.plz,
      ort: '',
      vollstaendig: plain,
      source: 'bayern'
    };

    if (parsed.plz) {
      const plzIndex = plain.indexOf(parsed.plz);
      if (plzIndex > 0) {
        data.strasse = plain.substring(0, plzIndex).trim();
        const afterPLZ = plain.substring(plzIndex + 5).trim();
        data.ort = afterPLZ.replace(/^[,\s]+/, '').trim();
      }
    }

    data.strasse = abbreviateStreetName(data.strasse, 'bayern');
    data.vollstaendig = abbreviateStreetName(data.vollstaendig, 'bayern');

    return data;
  }

  // ============================================================================
  // OPENPLZ API FUNKTIONEN
  // ============================================================================

  function loadStreetsForPostalCode(
    postalCode: string,
    callback: (error: any, streets: OpenPLZStreet[] | null) => void
  ): void {
    const cacheKey = `streets_${postalCode}`;

    if (streetCache[cacheKey]) {
      log(`Straßen aus Cache für PLZ ${postalCode}`, null, 'debug');
      callback(null, streetCache[cacheKey]);
      return;
    }

    log(`Lade Straßen für PLZ ${postalCode} von OpenPLZ`, null, 'debug');

    let allStreets: OpenPLZStreet[] = [];
    let currentPage = 1;

    function loadPage(): void {
      $.ajax({
        url: `${CONFIG.OPENPLZ_API.BASE_URL}/Streets`,
        method: 'GET',
        dataType: 'json',
        data: {
          postalCode,
          page: currentPage,
          pageSize: CONFIG.PAGE_SIZE
        },
        timeout: 5000,
        success: (data: OpenPLZStreet[]) => {
          if (data && Array.isArray(data) && data.length > 0) {
            allStreets = allStreets.concat(data);
            log(`OpenPLZ Seite ${currentPage}: ${data.length} Straßen`, null, 'debug');

            if (data.length === CONFIG.PAGE_SIZE && currentPage < CONFIG.MAX_PAGES) {
              currentPage++;
              loadPage();
            } else {
              log(`OpenPLZ: ${allStreets.length} Straßen für PLZ ${postalCode}`, null, 'success');
              streetCache[cacheKey] = allStreets;
              callback(null, allStreets);
            }
          } else {
            streetCache[cacheKey] = allStreets;
            callback(null, allStreets);
          }
        },
        error: (xhr, status, error) => {
          log(`OpenPLZ Fehler: ${error}`, null, 'error');
          callback(error, null);
        }
      });
    }

    loadPage();
  }

  function extractOpenPLZAddressData(street: OpenPLZStreet): AddressData | null {
    if (!street) return null;

    const data: AddressData = {
      strasse: street.name || '',
      plz: street.postalCode || '',
      ort: street.locality || '',
      vollstaendig: `${street.name || ''} ${street.postalCode || ''} ${street.locality || ''}`,
      source: 'openplz'
    };

    return data;
  }

  // ============================================================================
  // HYBRID SEARCH LOGIK
  // ============================================================================

  function hybridSearch(
    suchbegriff: string,
    group: FieldGroup,
    callback: (error: any, results: AddressData[]) => void
  ): void {
    log(`Starte Hybrid-Suche für: ${suchbegriff}`, null, 'info');

    const inputAnalysis = analyzeInput(suchbegriff);
    log(`Eingabetyp: ${inputAnalysis.description}`, null, 'debug');

    if (inputAnalysis.type === 'postalcode_only' && inputAnalysis.plz) {
      log('→ Nur PLZ erkannt: Lade Straßen von OpenPLZ', null, 'info');

      loadStreetsForPostalCode(inputAnalysis.plz, (error, streets) => {
        if (!error && streets && streets.length > 0) {
          const results = streets
            .map(extractOpenPLZAddressData)
            .filter((item): item is AddressData => item !== null && !!item.strasse);
          callback(null, results);
        } else {
          callback(null, []);
        }
      });
      return;
    }

    if (inputAnalysis.type === 'with_postalcode' && inputAnalysis.plz) {
      if (!inputAnalysis.isBayern) {
        log(`→ Nicht-bayerische PLZ erkannt (${inputAnalysis.plz}): Wechsle zu OpenPLZ`, null, 'info');

        loadStreetsForPostalCode(inputAnalysis.plz, (error, streets) => {
          if (!error && streets && streets.length > 0) {
            const searchWithoutPLZ = suchbegriff
              .replace(/\d{5}/g, '')
              .replace(/,/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .toLowerCase();

            const streetSearch = searchWithoutPLZ.split(' ')[0];

            let filteredStreets = streets.filter(street => {
              const streetName = (street.name || '').toLowerCase();
              return streetName.indexOf(streetSearch) !== -1 ||
                     streetSearch.indexOf(streetName.substring(0, 5)) !== -1 ||
                     streetSearch.length < 3;
            });

            if (filteredStreets.length === 0) {
              filteredStreets = streets;
            }

            const results = filteredStreets
              .map(extractOpenPLZAddressData)
              .filter((item): item is AddressData => item !== null && !!item.strasse);

            callback(null, results);
          } else {
            callback(null, []);
          }
        });
        return;
      }

      log(`→ Bayerische PLZ erkannt (${inputAnalysis.plz}): Suche in Bayern API`, null, 'info');
      searchBayernAPI(suchbegriff, (error, bayernResults) => {
        if (!error && bayernResults && bayernResults.length > 0) {
          const results = bayernResults
            .map(extractBayernAddressData)
            .filter((item): item is AddressData => item !== null);
          callback(null, results);
        } else {
          callback(null, []);
        }
      });
      return;
    }

    log('→ Keine PLZ erkannt: Suche in Bayern API (Standard)', null, 'info');

    searchBayernAPI(suchbegriff, (error, bayernResults) => {
      if (!error && bayernResults && bayernResults.length > 0) {
        const results = bayernResults
          .map(extractBayernAddressData)
          .filter((item): item is AddressData => item !== null);
        callback(null, results);
      } else {
        callback(null, []);
      }
    });
  }

  function showAutocomplete(
    results: AddressData[],
    $field: JQuery<HTMLElement>,
    group: FieldGroup
  ): void {
    $field.parent().find('.hybrid-autocomplete').remove();

    if (!results || results.length === 0) return;

    const $autocomplete = $('<ul class="hybrid-autocomplete" style="position: absolute; background: white; border: 1px solid #ccc; max-height: 200px; overflow-y: auto; width: 100%; z-index: 1000; list-style: none; padding: 0; margin: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.15);"></ul>');

    results.slice(0, 10).forEach((result, index) => {
      const displayText = result.strasse
        ? `${result.strasse} ${result.plz} ${result.ort}`
        : `${result.plz} ${result.ort}`;

      const sourceLabel = result.source === 'bayern' ? ' 🏔️' : ' 🇩🇪';

      const $item = $(`<li style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 14px;" data-index="${index}">${displayText}${sourceLabel}</li>`);

      $item.on('mouseenter', function() {
        $(this).css('background-color', '#f5f5f5');
      }).on('mouseleave', function() {
        $(this).css('background-color', 'white');
      });

      $item.on('click', () => {
        selectAddress(result, group);
        $autocomplete.remove();
      });

      $autocomplete.append($item);
    });

    $field.parent().css('position', 'relative');
    $field.parent().append($autocomplete);
  }

  function selectAddress(addressData: AddressData, group: FieldGroup): void {
    log(`Wähle Adresse: ${addressData.vollstaendig} (Quelle: ${addressData.source})`, null, 'success');

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

  function initializeSuchField(group: FieldGroup): void {
    const $field = group.suche;

    if ($field.data('hybrid-init')) return;

    $field.data('hybrid-init', true);
    log(`Initialisiere Suchfeld: ${group.id}`, null, 'debug');

    $field.on('input', function() {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }

      const value = ($(this).val() as string || '').trim();

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

      debounceTimer = window.setTimeout(() => {
        hybridSearch(value, group, (error, results) => {
          if (!error) {
            showAutocomplete(results, $field, group);
          }
        });
      }, CONFIG.DEBOUNCE_DELAY);
    });

    $field.on('blur', () => {
      if (group.source === 'openplz') {
        validateStreetField(group);
      }
    });

    $(document).on('click', (e: JQuery.ClickEvent) => {
      if (!$(e.target).closest('.hybrid-autocomplete').length &&
          !$(e.target).closest($field).length) {
        $field.parent().find('.hybrid-autocomplete').remove();
      }
    });

    $field.on('keydown', function(e: JQuery.KeyDownEvent) {
      if (e.keyCode === 27) {
        $(this).parent().find('.hybrid-autocomplete').remove();
      }
    });

    $field.on('change', function() {
      const value = ($(this).val() as string || '').trim();
      if (!value) {
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
  }

  // ============================================================================
  // MUTATION OBSERVER
  // ============================================================================

  function initializeNewFields(): void {
    const $suchFields = $(`.${CONFIG.FIELD_CLASSES.suche}`);
    let newFieldsCount = 0;

    $suchFields.each(function() {
      const $field = $(this);

      if ($field.data('hybrid-init')) return;

      const group = createFieldGroup($field);
      if (group) {
        fieldGroups.push(group);
        initializeSuchField(group);
        newFieldsCount++;
      }
    });

    if (newFieldsCount > 0) {
      log(`Neue Felder initialisiert: ${newFieldsCount}`, null, 'success');
    }
  }

  function startMutationObserver(): void {
    if (!CONFIG.OBSERVER.ENABLED) {
      log('MutationObserver ist deaktiviert', null, 'debug');
      return;
    }

    if (mutationObserver) {
      log('MutationObserver läuft bereits', null, 'debug');
      return;
    }

    mutationObserver = new MutationObserver((mutations: MutationRecord[]) => {
      let shouldReinitialize = false;

      mutations.forEach((mutation: MutationRecord) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node: Node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const $node = $(node as HTMLElement);
              if ($node.hasClass(CONFIG.FIELD_CLASSES.suche) ||
                  $node.find(`.${CONFIG.FIELD_CLASSES.suche}`).length > 0) {
                shouldReinitialize = true;
              }
            }
          });
        }
      });

      if (shouldReinitialize) {
        if (observerDebounceTimer !== null) {
          clearTimeout(observerDebounceTimer);
        }
        observerDebounceTimer = window.setTimeout(() => {
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

  function stopMutationObserver(): void {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
      log('MutationObserver gestoppt', null, 'debug');
    }
  }

  // ============================================================================
  // INITIALISIERUNG
  // ============================================================================

  function initialize(): void {
    log('Initialisiere Hybrid Address Search v11.0-TS (TypeScript)', null, 'info');

    const $suchFields = $(`.${CONFIG.FIELD_CLASSES.suche}`);

    if ($suchFields.length === 0) {
      log('Keine Suchfelder gefunden - warte auf dynamische Elemente...', null, 'warn');
    } else {
      log(`Gefundene Suchfelder: ${$suchFields.length}`, null, 'debug');

      $suchFields.each(function() {
        const group = createFieldGroup($(this));
        if (group) {
          fieldGroups.push(group);
          initializeSuchField(group);
        }
      });

      log(`Initialisierung abgeschlossen. ${fieldGroups.length} Feldgruppen aktiv`, null, 'success');
    }

    startMutationObserver();
  }

  function reinitialize(): void {
    log('Manuelle Neuinitialisierung gestartet...', null, 'info');
    initializeNewFields();
  }

  // ============================================================================
  // ÖFFENTLICHE API
  // ============================================================================

  const api: HybridAddressSearchAPI = {
    initialize,
    reinitialize,
    initializeNewFields,
    startObserver: startMutationObserver,
    stopObserver: stopMutationObserver,
    config: CONFIG,
    log,
    analyzeInput,
    isBayernPLZ,
    hasHouseNumber,
    validateStreetField,
    getFieldGroups: () => fieldGroups
  };

  // Expose to global scope
  (window as any).HybridAddressSearch = api;

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
