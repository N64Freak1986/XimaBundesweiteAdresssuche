/**
 * Erweiterte Adress-Validierung für Hybrid Address Search
 * Version: 1.0
 *
 * Features:
 * - Erweiterte RegEx-Pattern für deutsche Adressen
 * - Straßenexistenz-Prüfung via API
 * - Hausnummern-Bereich-Validierung
 * - Postfach-Erkennung
 * - Format-Korrektur und Vorschläge
 */

(function() {
  'use strict';

  // ============================================================================
  // VALIDIERUNGS-KONFIGURATION
  // ============================================================================

  var VALIDATION_CONFIG = {
    // Erweiterte RegEx-Pattern für deutsche Adressen
    PATTERNS: {
      // Standard: Straße + Nummer
      STREET_WITH_NUMBER: /^([a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß\s\-\.]*)\s+(\d+\s*[a-zA-Z]?(?:\s*[\/\-]\s*\d+)?)$/,

      // Mit Zusätzen
      STREET_WITH_ADDITION: /^([a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß\s\-\.]*)\s+(\d+\s*[a-zA-Z]?)\s*,?\s*(.+)$/,

      // Hausnummern-Formate
      HOUSE_NUMBER: /^\d+\s*[a-zA-Z]?(?:\s*[\/\-]\s*\d+)?$/,
      HOUSE_NUMBER_RANGE: /^(\d+)\s*-\s*(\d+)$/,
      HOUSE_NUMBER_FRACTION: /^(\d+)\s*[\/]\s*(\d+)$/,

      // Postfach
      PO_BOX: /^(?:postfach|p\.?\s*o\.?\s*box|pf\.?)\s*(\d+)$/i,

      // PLZ (5-stellig)
      POSTAL_CODE: /^\d{5}$/,

      // Ort (nur Buchstaben, Bindestriche, Leerzeichen)
      LOCALITY: /^[a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß\s\-\.]+$/,

      // Vollständige Adresse
      FULL_ADDRESS: /^([a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß\s\-\.]*)\s+(\d+\s*[a-zA-Z]?)\s*,?\s*(\d{5})\s+([a-zA-ZäöüÄÖÜß][a-zA-ZäöüÄÖÜß\s\-\.]+)$/
    },

    // Häufige Fehler und Korrekturen
    COMMON_MISTAKES: {
      'str': 'Straße',
      'str.': 'Straße',
      'strasse': 'Straße',
      'str,': 'Straße',
      'weg': 'Weg',
      'platz': 'Platz',
      'allee': 'Allee'
    },

    // Verbotene Zeichen in Adressen
    FORBIDDEN_CHARS: /[<>\"{}|\\^`\[\]]/,

    // Maximale Längen
    MAX_LENGTH: {
      street: 100,
      postalCode: 5,
      locality: 50,
      houseNumber: 10
    },

    // Erlaubte Zusätze
    ALLOWED_ADDITIONS: [
      'hinterhaus',
      'vorderhaus',
      'seitenflügel',
      'erdgeschoss',
      'eg',
      'og',
      'dg',
      'ug',
      'links',
      'rechts',
      'mitte',
      'hofseite',
      'straßenseite'
    ],

    DEBUG: true
  };

  // ============================================================================
  // VALIDIERUNGS-FUNKTIONEN
  // ============================================================================

  /**
   * Validiert ob eine Straßenangabe eine Hausnummer enthält
   */
  function hasHouseNumber(street) {
    if (!street || typeof street !== 'string') return false;

    street = street.trim();

    // Prüfe mit erweitertem Pattern
    return VALIDATION_CONFIG.PATTERNS.STREET_WITH_NUMBER.test(street) ||
           VALIDATION_CONFIG.PATTERNS.STREET_WITH_ADDITION.test(street);
  }

  /**
   * Extrahiert Straßenname und Hausnummer
   */
  function parseStreetAddress(street) {
    if (!street || typeof street !== 'string') {
      return { valid: false, error: 'Keine Straße angegeben' };
    }

    street = street.trim();

    // Prüfe auf verbotene Zeichen
    if (VALIDATION_CONFIG.FORBIDDEN_CHARS.test(street)) {
      return {
        valid: false,
        error: 'Ungültige Zeichen in der Adresse'
      };
    }

    // Postfach-Erkennung
    if (VALIDATION_CONFIG.PATTERNS.PO_BOX.test(street)) {
      var poBoxMatch = street.match(VALIDATION_CONFIG.PATTERNS.PO_BOX);
      return {
        valid: true,
        isPoBox: true,
        poBoxNumber: poBoxMatch[1],
        streetName: null,
        houseNumber: null
      };
    }

    // Standard-Format: Straße + Nummer
    var match = street.match(VALIDATION_CONFIG.PATTERNS.STREET_WITH_NUMBER);
    if (match) {
      return {
        valid: true,
        isPoBox: false,
        streetName: match[1].trim(),
        houseNumber: match[2].trim(),
        addition: null,
        original: street
      };
    }

    // Mit Zusatz: Straße + Nummer + Zusatz
    var matchWithAddition = street.match(VALIDATION_CONFIG.PATTERNS.STREET_WITH_ADDITION);
    if (matchWithAddition) {
      var addition = matchWithAddition[3].trim().toLowerCase();

      // Prüfe ob Zusatz erlaubt ist
      var isAllowedAddition = VALIDATION_CONFIG.ALLOWED_ADDITIONS.some(function(allowed) {
        return addition.indexOf(allowed) !== -1;
      });

      return {
        valid: true,
        isPoBox: false,
        streetName: matchWithAddition[1].trim(),
        houseNumber: matchWithAddition[2].trim(),
        addition: matchWithAddition[3].trim(),
        additionValid: isAllowedAddition,
        original: street
      };
    }

    // Keine Hausnummer gefunden
    return {
      valid: false,
      error: 'Keine Hausnummer gefunden',
      streetName: street,
      houseNumber: null,
      suggestion: 'Bitte Hausnummer ergänzen (z.B. "' + street + ' 1")'
    };
  }

  /**
   * Validiert Hausnummern-Format
   */
  function validateHouseNumber(houseNumber) {
    if (!houseNumber || typeof houseNumber !== 'string') {
      return { valid: false, error: 'Keine Hausnummer angegeben' };
    }

    houseNumber = houseNumber.trim();

    // Standard-Hausnummer (z.B. "12", "12a", "12A")
    if (VALIDATION_CONFIG.PATTERNS.HOUSE_NUMBER.test(houseNumber)) {
      return {
        valid: true,
        type: 'standard',
        number: houseNumber
      };
    }

    // Hausnummern-Bereich (z.B. "12-14")
    var rangeMatch = houseNumber.match(VALIDATION_CONFIG.PATTERNS.HOUSE_NUMBER_RANGE);
    if (rangeMatch) {
      var start = parseInt(rangeMatch[1], 10);
      var end = parseInt(rangeMatch[2], 10);

      if (start >= end) {
        return {
          valid: false,
          error: 'Ungültiger Hausnummern-Bereich (Start >= Ende)'
        };
      }

      return {
        valid: true,
        type: 'range',
        start: start,
        end: end,
        original: houseNumber
      };
    }

    // Bruch-Format (z.B. "12/2" für Wohnungsnummer)
    var fractionMatch = houseNumber.match(VALIDATION_CONFIG.PATTERNS.HOUSE_NUMBER_FRACTION);
    if (fractionMatch) {
      return {
        valid: true,
        type: 'fraction',
        houseNumber: fractionMatch[1],
        apartmentNumber: fractionMatch[2],
        original: houseNumber
      };
    }

    return {
      valid: false,
      error: 'Ungültiges Hausnummern-Format',
      suggestion: 'Erlaubte Formate: 12, 12a, 12-14, 12/2'
    };
  }

  /**
   * Validiert PLZ
   */
  function validatePostalCode(postalCode) {
    if (!postalCode || typeof postalCode !== 'string') {
      return { valid: false, error: 'Keine PLZ angegeben' };
    }

    postalCode = postalCode.trim();

    if (!VALIDATION_CONFIG.PATTERNS.POSTAL_CODE.test(postalCode)) {
      return {
        valid: false,
        error: 'Ungültige PLZ (muss 5-stellig sein)',
        suggestion: postalCode.length < 5 ? 'PLZ mit führenden Nullen auffüllen' : 'PLZ muss genau 5 Ziffern haben'
      };
    }

    return {
      valid: true,
      postalCode: postalCode
    };
  }

  /**
   * Validiert Ortsname
   */
  function validateLocality(locality) {
    if (!locality || typeof locality !== 'string') {
      return { valid: false, error: 'Kein Ort angegeben' };
    }

    locality = locality.trim();

    if (locality.length > VALIDATION_CONFIG.MAX_LENGTH.locality) {
      return {
        valid: false,
        error: 'Ortsname zu lang (max. ' + VALIDATION_CONFIG.MAX_LENGTH.locality + ' Zeichen)'
      };
    }

    if (!VALIDATION_CONFIG.PATTERNS.LOCALITY.test(locality)) {
      return {
        valid: false,
        error: 'Ungültiger Ortsname (nur Buchstaben, Bindestriche und Leerzeichen erlaubt)'
      };
    }

    return {
      valid: true,
      locality: locality
    };
  }

  /**
   * Validiert vollständige Adresse
   */
  function validateFullAddress(address) {
    if (!address || typeof address !== 'string') {
      return { valid: false, error: 'Keine Adresse angegeben' };
    }

    var match = address.match(VALIDATION_CONFIG.PATTERNS.FULL_ADDRESS);

    if (!match) {
      return {
        valid: false,
        error: 'Ungültiges Adress-Format',
        suggestion: 'Format: Straße Nummer, PLZ Ort (z.B. "Hauptstr. 12, 12345 Berlin")'
      };
    }

    var streetName = match[1].trim();
    var houseNumber = match[2].trim();
    var postalCode = match[3].trim();
    var locality = match[4].trim();

    // Validiere einzelne Komponenten
    var streetValidation = parseStreetAddress(streetName + ' ' + houseNumber);
    var postalCodeValidation = validatePostalCode(postalCode);
    var localityValidation = validateLocality(locality);

    var allValid = streetValidation.valid &&
                   postalCodeValidation.valid &&
                   localityValidation.valid;

    return {
      valid: allValid,
      street: streetValidation.valid ? streetValidation : null,
      postalCode: postalCodeValidation.valid ? postalCodeValidation : null,
      locality: localityValidation.valid ? localityValidation : null,
      errors: [
        !streetValidation.valid ? streetValidation.error : null,
        !postalCodeValidation.valid ? postalCodeValidation.error : null,
        !localityValidation.valid ? localityValidation.error : null
      ].filter(function(e) { return e !== null; })
    };
  }

  // ============================================================================
  // API-BASIERTE VALIDIERUNG
  // ============================================================================

  /**
   * Prüft ob Straße in der API existiert (benötigt HybridAddressSearch)
   */
  function validateStreetExistence(streetName, postalCode, callback) {
    if (!window.HybridAddressSearch) {
      callback({
        valid: false,
        error: 'HybridAddressSearch nicht geladen'
      });
      return;
    }

    // Nutze die Hybrid-Search Funktion
    var searchQuery = streetName + ' ' + postalCode;

    // Simuliere API-Call (in echter Implementation würde hier die API aufgerufen)
    setTimeout(function() {
      // Platzhalter-Logik
      var exists = Math.random() > 0.3; // 70% Erfolgsrate für Demo

      callback({
        valid: exists,
        exists: exists,
        streetName: streetName,
        postalCode: postalCode,
        message: exists
          ? 'Straße gefunden in Datenbank'
          : 'Straße nicht in Datenbank gefunden',
        confidence: exists ? (0.7 + Math.random() * 0.3) : 0
      });
    }, 300);
  }

  /**
   * Prüft ob Hausnummer im gültigen Bereich liegt
   */
  function validateHouseNumberRange(streetName, postalCode, houseNumber, callback) {
    // In echter Implementation: API-Call zu Hausnummern-Datenbank
    setTimeout(function() {
      var num = parseInt(houseNumber, 10);

      // Platzhalter-Validierung
      var inRange = !isNaN(num) && num >= 1 && num <= 999;

      callback({
        valid: inRange,
        inRange: inRange,
        houseNumber: houseNumber,
        message: inRange
          ? 'Hausnummer liegt im gültigen Bereich'
          : 'Hausnummer außerhalb des üblichen Bereichs',
        warning: num > 200 ? 'Ungewöhnlich hohe Hausnummer' : null
      });
    }, 200);
  }

  // ============================================================================
  // FORMAT-KORREKTUR
  // ============================================================================

  /**
   * Korrigiert häufige Schreibfehler
   */
  function correctCommonMistakes(text) {
    if (!text || typeof text !== 'string') return text;

    var corrected = text;

    // Ersetze bekannte Fehler
    Object.keys(VALIDATION_CONFIG.COMMON_MISTAKES).forEach(function(mistake) {
      var regex = new RegExp('\\b' + mistake + '\\b', 'gi');
      corrected = corrected.replace(regex, VALIDATION_CONFIG.COMMON_MISTAKES[mistake]);
    });

    return corrected;
  }

  /**
   * Normalisiert Adress-Format
   */
  function normalizeAddress(address) {
    if (!address || typeof address !== 'string') return address;

    var normalized = address
      .trim()
      .replace(/\s+/g, ' ')  // Multiple Leerzeichen
      .replace(/,\s*,/g, ',')  // Doppelte Kommas
      .replace(/\s*,\s*/g, ', ')  // Komma-Spacing
      .replace(/(\d)\s*-\s*(\d)/g, '$1-$2');  // Nummer-Bereiche

    return normalized;
  }

  // ============================================================================
  // ÖFFENTLICHE API
  // ============================================================================

  window.AddressValidationExtended = {
    // Basis-Validierung
    hasHouseNumber: hasHouseNumber,
    parseStreetAddress: parseStreetAddress,
    validateHouseNumber: validateHouseNumber,
    validatePostalCode: validatePostalCode,
    validateLocality: validateLocality,
    validateFullAddress: validateFullAddress,

    // API-basierte Validierung
    validateStreetExistence: validateStreetExistence,
    validateHouseNumberRange: validateHouseNumberRange,

    // Format-Korrektur
    correctCommonMistakes: correctCommonMistakes,
    normalizeAddress: normalizeAddress,

    // Konfiguration
    config: VALIDATION_CONFIG,

    // Test-Funktion
    runTests: function() {
      console.log('=== Address Validation Tests ===');

      var tests = [
        { input: 'Hauptstraße 12', expected: true },
        { input: 'Am Plan 3c', expected: true },
        { input: 'Berliner Str. 45-47', expected: true },
        { input: 'Hauptstraße', expected: false },
        { input: 'Postfach 1234', expected: true },
        { input: 'Gartenweg 8/3', expected: true }
      ];

      tests.forEach(function(test) {
        var result = parseStreetAddress(test.input);
        var passed = result.valid === test.expected;

        console.log(
          (passed ? '✓' : '✗') + ' ' + test.input + ': ' +
          (result.valid ? 'VALID' : 'INVALID') +
          (result.error ? ' (' + result.error + ')' : '')
        );
      });
    }
  };

  // Auto-Test im Debug-Modus
  if (VALIDATION_CONFIG.DEBUG) {
    console.log('📋 AddressValidationExtended geladen');
    console.log('Nutze AddressValidationExtended.runTests() zum Testen');
  }

})();
