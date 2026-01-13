# Hybrid Adresssuche - Bayern + OpenPLZ Integration

![Version](https://img.shields.io/badge/version-11.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Bundesweite Adressvalidierung mit intelligenter Hybrid-Suche: **OpenPLZ** für Deutschland (bis zur Straße) und **Bayern Ortssuchdienst** für Bayern (bis zur Hausnummer).

## 🎯 Features

### ✨ Version 11.0 - Optionales Straßenfeld
- **Flexibles Formular-Layout**: Das `openplz-street` Feld ist jetzt optional
- Unterstützt Formulare mit nur 3 Feldern (Suche, PLZ, Ort)
- Abwärtskompatibel mit Formularen, die 4 Felder nutzen

### 🆕 Frühere Versionen
- **V10**: Automatische Kürzung von "Straße" zu "Str." (LBDV-Kompatibilität für Bayern)
- **V9**: MutationObserver für dynamisch hinzugefügte Elemente (wiederholbare Container)
- **V9**: Automatische Erkennung neuer Suchfelder im DOM
- **V9**: `reinitialize()` Funktion für manuelle Neuinitialisierung

### 🏔️ Bayern Ortssuchdienst
- Validierung bis zur **Hausnummer** für Bayern (PLZ 80000-87999, 90000-97999)
- Direkte Anbindung an offizielle Geoservices Bayern API
- Automatische Straßennamen-Kürzung nach LBDV-Standard

### 🇩🇪 OpenPLZ API
- Bundesweite Straßenverzeichnisse
- Hausnummer-Validierung via RegEx
- Fehlermeldung bei fehlender Hausnummer

### 🚀 Intelligente Hybrid-Logik
- **Automatische API-Wahl** basierend auf PLZ-Erkennung
- **PLZ-basierte Filterung**: Bei Eingabe nicht-bayerischer PLZ → OpenPLZ
- **Fallback-Mechanismus**: Keine Ergebnisse → Alternative API
- **Smart-Caching**: Straßen werden pro PLZ gecacht

### 🎨 Benutzerfreundlichkeit
- Echtzeit-Autocomplete mit Debouncing (300ms)
- Visuelle Quellenanzeige (🏔️ Bayern / 🇩🇪 OpenPLZ)
- Feldvalidierung mit inline Fehlermeldungen
- Automatisches Sperren ausgefüllter PLZ/Ort-Felder
- ESC-Taste schließt Autocomplete

### 🔄 Dynamische Formulare
- **MutationObserver**: Erkennt automatisch neue Felder im DOM
- Ideal für wiederholbare Container und AJAX-Formulare
- Manuelle Reinitialisierung möglich: `HybridAddressSearch.reinitialize()`

---

## 📋 Voraussetzungen

- **jQuery** (getestet mit v3.x)
- Modernes Browser mit ES5-Support
- Optional: Bayern API-Key (für Bayern-Suche)

---

## 🚀 Installation

### 1. Datei einbinden

```html
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script src="hybrid-address-search.js"></script>
```

### 2. Bayern API-Key konfigurieren

Öffne `hybrid-address-search.js` und trage deinen API-Key ein:

```javascript
var CONFIG = {
  BAYERN_API: {
    BASE_URL: 'https://geoservices.bayern.de/services/ortssuche/v1',
    API_KEY: 'DEIN_API_KEY_HIER',  // ← API-Key eintragen
    ENABLED: true
  },
  // ...
};
```

**Bayern API-Key beantragen:**
[https://geodatenonline.bayern.de/geodatenonline/](https://geodatenonline.bayern.de/geodatenonline/)

---

## 📝 HTML-Markup

### Option A: Formular mit 4 Feldern (klassisch)

```html
<div>
  <label>Adresssuche</label>
  <input type="text"
         class="openplz-suche"
         placeholder="Straße oder PLZ eingeben">
</div>

<div>
  <label>Straße</label>
  <input type="text"
         class="openplz-street"
         placeholder="Straße + Hausnummer">
</div>

<div>
  <label>PLZ</label>
  <input type="text"
         class="openplz-postalcode"
         placeholder="PLZ">
</div>

<div>
  <label>Ort</label>
  <input type="text"
         class="openplz-locality"
         placeholder="Ort">
</div>
```

### Option B: Formular mit 3 Feldern (ohne separates Straßenfeld)

```html
<div>
  <label>Adresssuche</label>
  <input type="text"
         class="openplz-suche"
         placeholder="Straße oder PLZ eingeben">
</div>

<div>
  <label>PLZ</label>
  <input type="text"
         class="openplz-postalcode"
         placeholder="PLZ">
</div>

<div>
  <label>Ort</label>
  <input type="text"
         class="openplz-locality"
         placeholder="Ort">
</div>
```

**Wichtig:**
- `openplz-suche` (Pflicht)
- `openplz-postalcode` (Pflicht)
- `openplz-locality` (Pflicht)
- `openplz-street` (Optional seit V11)

---

## ⚙️ Konfiguration

Alle Einstellungen befinden sich im `CONFIG`-Objekt:

### API-Konfiguration

```javascript
BAYERN_API: {
  BASE_URL: 'https://geoservices.bayern.de/services/ortssuche/v1',
  API_KEY: 'DEIN_API_KEY',
  ENABLED: true  // Bayern API aktivieren/deaktivieren
},

OPENPLZ_API: {
  BASE_URL: 'https://openplzapi.org/de',
  ENABLED: true  // OpenPLZ API aktivieren/deaktivieren
}
```

### Feldklassen anpassen

```javascript
FIELD_CLASSES: {
  suche: 'openplz-suche',      // Suchfeld
  plz: 'openplz-postalcode',   // PLZ-Feld
  ort: 'openplz-locality',     // Ort-Feld
  strasse: 'openplz-street'    // Straßenfeld (optional)
}
```

### Bayern PLZ-Bereiche

```javascript
BAYERN_PLZ_RANGES: [
  { min: 80000, max: 87999 },  // München-Region
  { min: 90000, max: 97999 }   // Franken-Region
]
```

### Straßennamen-Kürzung (LBDV)

```javascript
STREET_ABBREVIATION: {
  ENABLED: true,              // Kürzung aktivieren
  APPLY_TO_BAYERN: true,      // Nur bei Bayern-Adressen
  APPLY_TO_OPENPLZ: false,    // Bei OpenPLZ-Adressen
  RULES: [
    { pattern: /straße(\s|$)/gi, replacement: 'str.$1' },
    { pattern: /Straße(\s|$)/g,  replacement: 'Str.$1' },
    { pattern: /STRASSE(\s|$)/g, replacement: 'STR.$1' }
  ]
}
```

**Beispiel:**
- Input: `Herrenstraße 7, 80539 München`
- Output: `Herrenstr. 7, 80539 München`

### Performance-Einstellungen

```javascript
DEBOUNCE_DELAY: 300,          // Verzögerung Autocomplete (ms)
AUTOCOMPLETE_MIN_LENGTH: 3,   // Min. Zeichen für Suche
PAGE_SIZE: 50,                // Ergebnisse pro Seite (OpenPLZ)
MAX_PAGES: 20,                // Max. Seiten (OpenPLZ)

OBSERVER: {
  ENABLED: true,              // MutationObserver aktivieren
  DEBOUNCE_DELAY: 100         // Verzögerung DOM-Änderung (ms)
}
```

### Debug-Modus

```javascript
DEBUG: true  // Konsolenausgaben aktivieren
```

---

## 🎮 Verwendung

### Automatische Initialisierung

Das Script initialisiert sich automatisch beim Laden:

```javascript
// Wird automatisch ausgeführt
document.addEventListener('DOMContentLoaded', initialize);
```

### Manuelle Neuinitialisierung

Nach dynamischem Hinzufügen von Feldern:

```javascript
// Neue Felder wurden per AJAX geladen
HybridAddressSearch.reinitialize();
```

### MutationObserver

Seit V9 werden neue Felder **automatisch erkannt**:

```javascript
// Observer starten (läuft standardmäßig)
HybridAddressSearch.startObserver();

// Observer stoppen
HybridAddressSearch.stopObserver();
```

### API-Funktionen

```javascript
// Alle Feldgruppen abrufen
var groups = HybridAddressSearch.getFieldGroups();

// Eingabe analysieren
var analysis = HybridAddressSearch.analyzeInput('Marienplatz 1 80331');
// → { type: 'with_postalcode', plz: '80331', isBayern: true, ... }

// PLZ-Prüfung
var isBayern = HybridAddressSearch.isBayernPLZ('80331');  // → true
var isNot = HybridAddressSearch.isBayernPLZ('10115');     // → false

// Hausnummer-Validierung
var valid = HybridAddressSearch.hasHouseNumber('Hauptstr. 12a');  // → true
var invalid = HybridAddressSearch.hasHouseNumber('Hauptstraße');  // → false
```

---

## 🔍 Suchmodi

### 1. Nur PLZ
```
Eingabe: "80331"
Verhalten: Lädt alle Straßen für PLZ 80331 via Bayern API
```

### 2. PLZ + Straße (Bayern)
```
Eingabe: "Marienplatz 80331" oder "80331 Marienplatz"
Verhalten: Bayern API → Ergebnisse bis Hausnummer
Anzeige: 🏔️ Marienplatz 1 80331 München
```

### 3. PLZ + Straße (nicht Bayern)
```
Eingabe: "Unter den Linden 10117"
Verhalten: OpenPLZ API → Ergebnisse bis Straßenname
Anzeige: 🇩🇪 Unter den Linden 10117 Berlin
Hinweis: Hausnummer manuell ergänzen
```

### 4. Nur Straßenname
```
Eingabe: "Hauptstraße"
Verhalten: Bayern API (Standard-Fallback)
```

---

## ✅ Validierung

### Bayern-Adressen (🏔️)
- **Keine Validierung**: Hausnummer bereits in API-Daten vorhanden
- Felder PLZ/Ort werden gesperrt
- Suche bleibt aktiv für Änderungen

### OpenPLZ-Adressen (🇩🇪)
- **Hausnummer-Pflicht**: RegEx-Validierung
- Fehlermeldung wenn Hausnummer fehlt
- Suche deaktiviert (nur Hausnummer ergänzen)

```javascript
// Validierungsregel
STREET_WITH_NUMBER_REGEX: /^(([a-zA-ZäöüÄÖÜß]\D*)\s+\d+?\s*.*)$/

// Gültige Formate:
✓ "Hauptstr. 42"
✓ "Am Plan 3c"
✓ "A-Weg 8"
✓ "Berliner Straße 12 1/2"

// Ungültige Formate:
✗ "Hauptstraße"
✗ "Berliner Str"
```

---

## 🎨 Styling

### Autocomplete-Liste

Das Autocomplete wird dynamisch generiert. Standard-Styles:

```css
.hybrid-autocomplete {
  position: absolute;
  background: white;
  border: 1px solid #ccc;
  max-height: 200px;
  overflow-y: auto;
  width: 100%;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.hybrid-autocomplete li {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.hybrid-autocomplete li:hover {
  background-color: #f5f5f5;
}
```

### Fehlermeldungen

```css
.hybrid-field-error {
  color: #d32f2f;
  font-size: 12px;
  margin-top: 4px;
  padding: 4px 8px;
  background: #ffebee;
  border-radius: 4px;
  border-left: 3px solid #d32f2f;
}
```

### Gesperrte Felder

```css
input[readonly].locked {
  background-color: #f5f5f5;
  cursor: not-allowed;
}
```

---

## 🔧 Erweiterte Beispiele

### Wiederholbare Container (XIMA Formcycle)

```html
<!-- Container 1 -->
<div id="address_c_1">
  <input class="openplz-suche" id="search_1">
  <input class="openplz-postalcode" id="plz_1">
  <input class="openplz-locality" id="ort_1">
  <input class="openplz-street" id="street_1">
</div>

<!-- Container 2 (wird dynamisch hinzugefügt) -->
<div id="address_c_2">
  <input class="openplz-suche" id="search_2">
  <input class="openplz-postalcode" id="plz_2">
  <input class="openplz-locality" id="ort_2">
  <input class="openplz-street" id="street_2">
</div>
```

**Automatische Erkennung durch MutationObserver!**

### Manuelles Triggern bei AJAX

```javascript
// Nach AJAX-Laden von Formularfeldern
$.ajax({
  url: '/load-form',
  success: function(html) {
    $('#form-container').html(html);

    // Optional: Manuelle Reinitialisierung
    HybridAddressSearch.reinitialize();
  }
});
```

### Custom Event Handling

```javascript
// Eigene Logik bei Adressauswahl
$(document).on('change', '.openplz-postalcode', function() {
  var plz = $(this).val();
  console.log('PLZ wurde gesetzt:', plz);

  // Eigene Validierung, API-Calls, etc.
});
```

---

## 🐛 Debugging

### Console Logs

Bei `DEBUG: true` werden folgende Logs ausgegeben:

```
✓ [HybridSearch] Initialisiere Hybrid Address Search v11.0
🔍 [HybridSearch] Erstelle Feldgruppe für: search_1
✅ [HybridSearch] Feldgruppe erstellt: search_1 (mit Straßenfeld)
🔍 [HybridSearch] Starte Hybrid-Suche für: Marienplatz 80331
✅ [HybridSearch] Bayern API: 15 Ergebnisse
✅ [HybridSearch] Wähle Adresse: Marienplatz 1 80331 München (Quelle: bayern)
```

### Feldgruppen inspizieren

```javascript
// Alle aktiven Feldgruppen
var groups = HybridAddressSearch.getFieldGroups();
console.table(groups);

// Einzelne Gruppe
var group = groups[0];
console.log('Quelle:', group.source);        // 'bayern' oder 'openplz'
console.log('Gesperrt:', group.isLocked);    // true/false
console.log('Hat Straßenfeld:', group.hasStrasseField);  // true/false
```

### Häufige Probleme

#### Autocomplete erscheint nicht
- jQuery geladen?
- CSS `position: relative` auf Parent-Element?
- Min. 3 Zeichen eingegeben?
- Debug-Logs prüfen

#### Felder werden nicht erkannt
- Klassen korrekt? (`openplz-suche`, `openplz-postalcode`, `openplz-locality`)
- MutationObserver aktiviert? (`CONFIG.OBSERVER.ENABLED = true`)
- Manuelle Reinitialisierung: `HybridAddressSearch.reinitialize()`

#### Bayern API gibt keine Ergebnisse
- API-Key korrekt eingetragen?
- PLZ im Bayern-Bereich? (80000-87999, 90000-97999)
- Netzwerk-Tab prüfen (403 = Key falsch, 404 = keine Treffer)

---

## 📊 API-Übersicht

### Bayern Geoservices API

**Endpoint:**
```
GET https://geoservices.bayern.de/services/ortssuche/v1/adressen/{suchbegriff}
```

**Parameter:**
- `filter`: `address`
- `srid`: `31468`
- `fuzzy`: `false`
- `api_key`: Dein API-Key

**Response:**
```json
{
  "results": [
    {
      "attrs": {
        "label": "<b>Marienplatz 1</b> 80331 München"
      }
    }
  ]
}
```

### OpenPLZ API

**Endpoint:**
```
GET https://openplzapi.org/de/Streets
```

**Parameter:**
- `postalCode`: PLZ
- `page`: Seitennummer
- `pageSize`: Ergebnisse pro Seite

**Response:**
```json
[
  {
    "name": "Unter den Linden",
    "postalCode": "10117",
    "locality": "Berlin"
  }
]
```

---

## 🗺️ PLZ-Bereiche Deutschland

| Region | PLZ-Bereich | API |
|--------|-------------|-----|
| **Bayern (München)** | 80000-87999 | 🏔️ Bayern |
| **Bayern (Franken)** | 90000-97999 | 🏔️ Bayern |
| Alle anderen | 00000-79999, 88000-89999, 98000-99999 | 🇩🇪 OpenPLZ |

---

## 📄 Lizenz

MIT License - Frei verwendbar für private und kommerzielle Projekte.

---

## 🤝 Support

Bei Fragen oder Problemen:
1. Debug-Modus aktivieren (`DEBUG: true`)
2. Browser-Konsole prüfen
3. Netzwerk-Tab öffnen (API-Aufrufe)

---

## 📌 Changelog

### v11.0 (2025)
- ✨ Straßenfeld (`openplz-street`) ist jetzt optional
- 🔧 Unterstützung für 3-Felder-Formulare (Suche, PLZ, Ort)
- 📝 Verbesserte Dokumentation

### v10.0 (2025)
- ✨ Automatische Straßennamen-Kürzung (LBDV-Kompatibilität)
- 🔧 Konfigurierbare Kürzungsregeln

### v9.0 (2025)
- ✨ MutationObserver für dynamische Elemente
- ✨ `reinitialize()` Funktion
- ✨ Automatische Erkennung neuer Suchfelder
- 🐛 Bugfixes für wiederholbare Container

### v8.0 und früher
- Hybrid-Suche mit Bayern + OpenPLZ
- Autocomplete-Funktionalität
- Validierung mit RegEx
- Caching-Mechanismus

---

## 🎯 Roadmap

- [ ] TypeScript-Version
- [ ] React/Vue/Angular-Komponenten
- [ ] Weitere API-Quellen (z.B. Nominatim)
- [ ] Erweiterte Validierung (Straßenexistenz)
- [ ] Offline-Modus mit IndexedDB

---

**Entwickelt für XIMA Formcycle und andere Formular-Frameworks**
