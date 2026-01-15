# 🧪 Experimentelle Features

Diese Dateien enthalten neue Features, die noch getestet werden müssen.

## 📦 Verfügbare Features

### 1. TypeScript-Version (v11.0-TS)

**Dateien:**
- `hybrid-address-search.ts` - TypeScript-Quellcode
- `tsconfig.json` - TypeScript-Konfiguration

**Features:**
- ✅ Vollständige Type Definitions
- ✅ Interfaces für alle Datenstrukturen
- ✅ Type-Safe API
- ✅ Strikte Compiler-Optionen
- ✅ Source Maps für Debugging

**Kompilierung:**
```bash
# TypeScript installieren (falls noch nicht vorhanden)
npm install -g typescript

# Kompilieren
tsc

# Output: hybrid-address-search-compiled.js
```

**Verwendung:**
```html
<script src="hybrid-address-search-compiled.js"></script>
<script>
  // Type-Safe API
  var groups = HybridAddressSearch.getFieldGroups();
  var analysis = HybridAddressSearch.analyzeInput("Marienplatz 80331");
</script>
```

**Status:** ⚠️ **Benötigt Tests**

**Vorteile:**
- Bessere IDE-Unterstützung (Autocomplete, IntelliSense)
- Compile-Time Fehlerprüfung
- Selbst-dokumentierender Code
- Refactoring-Sicherheit

---

### 2. Nominatim OSM API-Integration (v11.1-Nominatim)

**Datei:**
- `hybrid-address-search-nominatim.js`

**Features:**
- ✅ Nominatim OSM API als zusätzliche Datenquelle
- ✅ Weltweite Adresssuche möglich
- ✅ Fallback-Mechanismus (Bayern → OpenPLZ → Nominatim)
- ✅ Rate Limiting (1 Request/Sekunde)
- ✅ Konfigurierbarer User-Agent
- ✅ Caching für Performance

**Konfiguration:**
```javascript
NOMINATIM_API: {
  BASE_URL: 'https://nominatim.openstreetmap.org',
  ENABLED: true,
  PRIORITY: 3,  // Niedrigste Priorität (Fallback)
  USER_AGENT: 'HybridAddressSearch/11.1',  // WICHTIG: Anpassen!
  RATE_LIMIT: 1000,  // Min. 1000ms zwischen Requests
  COUNTRY_CODE: 'de',
  LANGUAGE: 'de',

  // Optionen
  USE_FOR_BAYERN: false,    // Auch für Bayern nutzen?
  USE_FOR_GERMANY: true,    // Für nicht-Bayern nutzen?
  USE_AS_FALLBACK: true     // Als Fallback nutzen?
}
```

**Verwendung:**
```html
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="hybrid-address-search-nominatim.js"></script>

<!-- Formulare wie gewohnt -->
<input class="openplz-suche">
<input class="openplz-postalcode">
<input class="openplz-locality">
<input class="openplz-street">
```

**API-Funktionen:**
```javascript
// Nominatim direkt aufrufen
HybridAddressSearchNominatim.searchNominatim('Berlin Alexanderplatz', function(err, results) {
  console.log(results);
});

// Hybrid-Suche mit Nominatim
HybridAddressSearchNominatim.hybridSearch('Unter den Linden 10117', group, function(err, results) {
  // Results von Allen APIs (Bayern, OpenPLZ, Nominatim)
});
```

**Autocomplete-Anzeige:**
- 🏔️ Bayern API
- 🇩🇪 OpenPLZ API
- 🌍 Nominatim OSM

**Nutzungsbedingungen:**
⚠️ **WICHTIG**: Nominatim API kostenlos, aber mit Regeln:
- Max. 1 Request pro Sekunde
- User-Agent Header Pflicht (anpassen!)
- Für kommerzielle heavy-use: Eigenen Server hosten
- Mehr Info: https://operations.osmfoundation.org/policies/nominatim/

**Status:** ⚠️ **Benötigt Tests & User-Agent Anpassung**

**Vorteile:**
- Weltweite Adressen suchbar
- Kostenlos (bei niedrigen Raten)
- OpenStreetMap-Daten
- Fallback wenn andere APIs versagen

**Nachteile:**
- Rate Limit (langsamer)
- Keine Hausnummern-Garantie
- Qualität variiert nach Region

---

### 3. Erweiterte Adress-Validierung (v1.0)

**Datei:**
- `address-validation-extended.js`

**Features:**
- ✅ Erweiterte RegEx-Pattern
- ✅ Postfach-Erkennung
- ✅ Hausnummern-Bereich (z.B. "12-14")
- ✅ Wohnungsnummern (z.B. "12/3")
- ✅ Format-Korrektur
- ✅ API-basierte Straßenexistenz-Prüfung
- ✅ Häufige Fehler korrigieren

**Test-Seite:**
- `test-validation.html` - Interaktive Tests

**Verwendung:**
```html
<script src="address-validation-extended.js"></script>
<script>
  // Straße parsen
  var result = AddressValidationExtended.parseStreetAddress('Hauptstraße 12a');
  console.log(result);
  // { valid: true, streetName: 'Hauptstraße', houseNumber: '12a' }

  // Hausnummer validieren
  var hnResult = AddressValidationExtended.validateHouseNumber('12-14');
  console.log(hnResult);
  // { valid: true, type: 'range', start: 12, end: 14 }

  // PLZ validieren
  var plzResult = AddressValidationExtended.validatePostalCode('80331');
  console.log(plzResult);
  // { valid: true, postalCode: '80331' }

  // Vollständige Adresse
  var fullResult = AddressValidationExtended.validateFullAddress('Hauptstr. 12, 80331 München');
  console.log(fullResult);
  // { valid: true, street: {...}, postalCode: {...}, locality: {...} }

  // Format korrigieren
  var corrected = AddressValidationExtended.correctCommonMistakes('haupt str 12');
  console.log(corrected);
  // 'Haupt Straße 12'

  // Normalisieren
  var normalized = AddressValidationExtended.normalizeAddress('Hauptstr.   12,  80331   München');
  console.log(normalized);
  // 'Hauptstr. 12, 80331 München'
</script>
```

**API-basierte Validierung:**
```javascript
// Straßenexistenz prüfen (benötigt HybridAddressSearch)
AddressValidationExtended.validateStreetExistence('Hauptstraße', '80331', function(result) {
  if (result.exists) {
    console.log('Straße existiert!');
  }
});

// Hausnummern-Bereich prüfen
AddressValidationExtended.validateHouseNumberRange('Hauptstraße', '80331', '12', function(result) {
  if (result.inRange) {
    console.log('Hausnummer im gültigen Bereich');
  }
});
```

**Unterstützte Formate:**
```javascript
// ✓ Gültige Adressen
'Hauptstraße 12'
'Am Plan 3c'
'Berliner Str. 45-47'  // Bereich
'Gartenweg 8/3'        // Wohnung
'Postfach 1234'        // Postfach

// ✗ Ungültige Adressen
'Hauptstraße'          // Keine Hausnummer
'Straße 12<>'          // Verbotene Zeichen
'123456'               // Keine Straße
```

**Status:** ⚠️ **Benötigt Tests & API-Integration**

**Vorteile:**
- Umfassende Validierung
- Fehlerkorrektur
- Format-Normalisierung
- Erweiterbar

---

## 🧪 Testing

### Test-Dateien öffnen:

```bash
# Validierungs-Tests
open test-validation.html

# Öffne im Browser und teste die Features interaktiv
```

### TypeScript kompilieren:

```bash
# Installiere TypeScript
npm install -g typescript

# Kompiliere
tsc

# Prüfe Output
cat hybrid-address-search-compiled.js
```

### Nominatim testen:

```bash
# Öffne demo.html und ersetze das Script:
# <script src="hybrid-address-search-nominatim.js"></script>

# Teste mit nicht-deutschen Adressen:
# "London Westminster"
# "Paris Eiffelturm"
```

---

## 📊 Feature-Status

| Feature | Status | Tests | Dokumentation | Production-Ready |
|---------|--------|-------|---------------|------------------|
| **TypeScript-Version** | ✅ Fertig | ⚠️ Ausstehend | ✅ Vorhanden | ❌ Nein |
| **Nominatim API** | ✅ Fertig | ⚠️ Ausstehend | ✅ Vorhanden | ⚠️ Mit Vorsicht |
| **Erweiterte Validierung** | ✅ Fertig | ⚠️ Teilweise | ✅ Vorhanden | ⚠️ Mit Tests |

---

## 🚀 Deployment

### Produktiv einsetzen:

**1. TypeScript-Version:**
```bash
# Kompilieren
tsc

# Minifizieren (optional)
npm install -g terser
terser hybrid-address-search-compiled.js -o hybrid-address-search.min.js -c -m

# In Produktion einbinden
<script src="hybrid-address-search.min.js"></script>
```

**2. Nominatim API:**
⚠️ **Vor Produktion:**
- User-Agent anpassen: `USER_AGENT: 'DeineProjektName/Version'`
- Rate Limiting prüfen
- Ggf. eigenen Nominatim-Server hosten
- Fallback-Logik testen

**3. Erweiterte Validierung:**
- Tests durchführen
- API-Integration implementieren
- Mit echten Daten testen

---

## ⚠️ Wichtige Hinweise

### TypeScript:
- Benötigt TypeScript Compiler
- Source Maps für Debugging
- Type Definitions für IDE-Support

### Nominatim:
- **User-Agent Pflicht!** Anpassen vor Nutzung
- Rate Limiting beachten (1 Req/Sek)
- Für Heavy-Use: Eigenen Server hosten
- Kostenlos != Unbegrenzt

### Validierung:
- API-basierte Features benötigen Backend
- RegEx deckt nicht alle Fälle ab
- Format-Korrektur ist heuristisch

---

## 📚 Weitere Ressourcen

**TypeScript:**
- https://www.typescriptlang.org/docs/

**Nominatim:**
- https://nominatim.org/release-docs/latest/
- https://operations.osmfoundation.org/policies/nominatim/
- https://wiki.openstreetmap.org/wiki/Nominatim

**Deutsche Adressen:**
- https://de.wikipedia.org/wiki/Adresse_(Geografie)
- https://www.openplzapi.org/

---

## 🤝 Beitragen

Hast du eines der Features getestet? Feedback willkommen!

1. Feature testen
2. Issues dokumentieren
3. Pull Request erstellen

---

## 📝 Changelog

### v11.0-TS (TypeScript)
- Erste TypeScript-Version
- Vollständige Type Definitions
- Strikte Type-Checking

### v11.1-Nominatim
- Nominatim OSM API Integration
- Weltweite Adresssuche
- Rate Limiting
- Multi-API Fallback

### v1.0 (Validierung)
- Erweiterte RegEx-Pattern
- Postfach-Unterstützung
- Hausnummern-Bereiche
- Format-Korrektur

---

**Status: EXPERIMENTELL - Vor Produktiveinsatz gründlich testen!** 🧪
