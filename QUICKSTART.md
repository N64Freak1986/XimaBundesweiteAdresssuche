# 🚀 Quick Start Guide - Hybrid Adresssuche

## Für XIMA Formcycle (5 Minuten Setup)

### Schritt 1: Datei hochladen

1. Im Formcycle Backend zu **Mandant → Mandantdateien** navigieren
2. `hybrid-address-search.js` hochladen
3. Fertig! Datei ist jetzt für alle Formulare verfügbar.

### Schritt 2: Formularfelder mit CSS-Klassen versehen

Öffne dein Formular und füge folgende CSS-Klassen hinzu:

| Feld | CSS-Klasse | Pflicht |
|------|------------|---------|
| **Suchfeld** | `openplz-suche` | ✓ Ja |
| **PLZ** | `openplz-postalcode` | ✓ Ja |
| **Ort** | `openplz-locality` | ✓ Ja |
| **Straße** | `openplz-street` | Optional (seit V11) |

**CSS-Klassen hinzufügen:**
- Feld auswählen → Eigenschaften → "CSS-Klasse (class)"

### Schritt 3: Bayern API-Key eintragen (optional)

1. **Kostenlos registrieren**: [https://geodatenonline.bayern.de/geodatenonline/](https://geodatenonline.bayern.de/geodatenonline/)
2. API-Key anfordern (wird innerhalb 1-2 Werktagen freigeschaltet)
3. In `hybrid-address-search.js` eintragen:

```javascript
BAYERN_API: {
  API_KEY: 'DEIN_API_KEY_HIER'  // ← Hier eintragen
}
```

**Ohne API-Key**: Script funktioniert trotzdem mit OpenPLZ für ganz Deutschland!

### Schritt 4: Testen

1. Formular öffnen
2. Im Suchfeld eingeben:
   - **Bayern**: `Marienplatz 80331`
   - **Berlin**: `Unter den Linden 10117`
   - **Nur PLZ**: `80331`
3. Autocomplete sollte erscheinen! 🎉

---

## Für Standard-HTML (3 Minuten Setup)

### Schritt 1: Dateien einbinden

```html
<!DOCTYPE html>
<html lang="de">
<head>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <script src="hybrid-address-search.js"></script>
</head>
<body>
    <!-- Dein Formular hier -->
</body>
</html>
```

### Schritt 2: HTML-Formular erstellen

**Option A: 3-Felder-Layout (einfach)**

```html
<input type="text" class="openplz-suche" placeholder="Adresssuche">
<input type="text" class="openplz-postalcode" placeholder="PLZ">
<input type="text" class="openplz-locality" placeholder="Ort">
```

**Option B: 4-Felder-Layout (mit Straße)**

```html
<input type="text" class="openplz-suche" placeholder="Adresssuche">
<input type="text" class="openplz-street" placeholder="Straße">
<input type="text" class="openplz-postalcode" placeholder="PLZ">
<input type="text" class="openplz-locality" placeholder="Ort">
```

### Schritt 3: Demo öffnen

```bash
# Öffne demo.html im Browser
open demo.html
```

---

## ✅ Erfolgreich? Prüfliste

- [ ] Suchfeld zeigt Autocomplete nach 3 Zeichen
- [ ] PLZ + Ort werden automatisch ausgefüllt
- [ ] Bayern-Adressen zeigen 🏔️ Symbol
- [ ] OpenPLZ-Adressen zeigen 🇩🇪 Symbol
- [ ] PLZ/Ort-Felder werden gesperrt nach Auswahl
- [ ] Browser-Konsole zeigt keine Fehler

---

## 🐛 Probleme?

### Autocomplete erscheint nicht

```javascript
// Browser-Konsole (F12) öffnen und prüfen:
HybridAddressSearch.config.DEBUG = true;  // Debug-Modus aktivieren
HybridAddressSearch.getFieldGroups();     // Feldgruppen anzeigen
```

**Häufige Ursachen:**
- jQuery nicht geladen
- CSS-Klassen falsch geschrieben
- Min. 3 Zeichen nicht erreicht

### Felder werden nicht erkannt

```javascript
// Manuelle Neuinitialisierung
HybridAddressSearch.reinitialize();
```

### Bayern API funktioniert nicht

1. API-Key korrekt eingetragen?
2. PLZ im Bayern-Bereich? (80000-87999, 90000-97999)
3. Netzwerk-Tab prüfen:
   - **403**: API-Key falsch
   - **404**: Keine Treffer

**Ohne Bayern-API weitermachen:**

```javascript
BAYERN_API: {
  ENABLED: false  // Bayern-API deaktivieren
}
```

---

## 📚 Weiterführende Dokumentation

- **Vollständige Doku**: Siehe [README.md](README.md)
- **Demo**: Öffne [demo.html](demo.html) im Browser
- **API-Referenz**: README.md → Abschnitt "API-Übersicht"
- **XIMA Formcycle**: [Mandantendateien Doku](https://help8.formcycle.eu/de/support/solutions/articles/103000046891-mandantdateien)

---

## 💡 Tipps & Tricks

### Wiederholbare Container (Formcycle)

Das Script funktioniert automatisch! Einfach Container hinzufügen, Felder werden erkannt.

```
📁 Adresse (wiederholt)
  ├─ openplz-suche
  ├─ openplz-postalcode
  └─ openplz-locality
```

### Custom Events triggern

```javascript
// Bei Adressauswahl eigene Logik ausführen
$(document).on('change', '.openplz-postalcode', function() {
  var plz = $(this).val();
  console.log('PLZ gesetzt:', plz);
  // Eigene Logik hier...
});
```

### Straßenkürzung deaktivieren

```javascript
STREET_ABBREVIATION: {
  ENABLED: false  // "Herrenstraße" bleibt "Herrenstraße"
}
```

### Performance optimieren

```javascript
DEBOUNCE_DELAY: 500,  // Längere Verzögerung = weniger API-Calls
PAGE_SIZE: 100,       // Mehr Ergebnisse pro Seite
```

---

## 🎯 Beispiel-Eingaben zum Testen

| Eingabe | Erwartetes Verhalten |
|---------|---------------------|
| `80331` | Zeigt alle Straßen für PLZ 80331 (Bayern) |
| `Marienplatz 80331` | Zeigt Marienplatz-Adressen mit Hausnummern 🏔️ |
| `Unter den Linden 10117` | Zeigt Unter den Linden (Berlin) 🇩🇪 |
| `Reeperbahn 20359` | Zeigt Reeperbahn (Hamburg) 🇩🇪 |
| `Hauptstraße` | Bayern-API Standard-Suche |

---

## 🚀 Du bist startklar!

Bei weiteren Fragen:
1. Debug-Modus aktivieren (`CONFIG.DEBUG = true`)
2. Browser-Konsole prüfen (F12)
3. [README.md](README.md) → Abschnitt "Debugging"

**Viel Erfolg mit der Hybrid Adresssuche!** 🎉
