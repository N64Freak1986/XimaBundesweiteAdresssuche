# Hybride Adresssuche – formcycle-Plugin (Bayern Ortssuchdienst + OpenPLZ)

Adress-Autovervollständigung für formcycle-Formulare:

- **Bayern** (PLZ 80000–87999, 90000–97999): Ortssuchdienst Bayern, Validierung bis zur Hausnummer, Kürzung „Straße“ → „Str.“ (LDBV-Schreibweise)
- **Bundesweit**: OpenPLZ API bis zur Straße, Hausnummer per RegEx geprüft
- **Ortsbeschränkung per CSS-Klasse**, z. B. `openplz-kempten` → nur PLZ 87435, 87437, 87439
- Wiederholbare Container (MutationObserver), optionales Straßenfeld, `window.HybridAddressSearch` wie bisher

Seit Version 1.0.0 ist die Adresssuche ein formcycle-Plugin. Das frühere Skript (`hybrid-address-search.js` V12) enthielt den API-Key des Ortssuchdienstes im Quelltext und damit in jedem Browser. **Im Plugin bleibt der Key auf dem Server:** Der Browser fragt das Plugin-Servlet, das den Ortssuchdienst mit dem hinterlegten Key aufruft und nur die Adress-Labels zurückgibt.

## Voraussetzungen

- formcycle ab 8.5.0, Installation als **Mandanten-Plugin**
- API-Key für den Ortssuchdienst Bayern (geoservices.bayern.de); ohne Key läuft nur die OpenPLZ-Suche

## Installation (Ablösung des bisherigen Skripts)

1. `dist/fc-plugin-adresssuche-1.0.1.jar` unter *Mandant › Plugins* hochladen.
2. In den Plugin-Einstellungen den **Bayern API-Key** eintragen (Feld wird maskiert gespeichert).
3. In jedem Formular, das die Adresssuche nutzt, unter *Dateien/Ressourcen* die alte JS-Datei (bzw. den eingefügten Skript-Code) **entfernen** und die Plugin-Ressource **`hybrid-address-search.js`** einbinden.
4. Formulare speichern. Feldklassen und Container-Klassen bleiben unverändert, es ist keine weitere Anpassung nötig.
5. Den bisher veröffentlichten API-Key beim Ortssuchdienst Bayern **sperren und neu ausstellen** lassen und nur den neuen Key im Plugin hinterlegen. Der alte Key war über die Formularseiten öffentlich abrufbar.

Ist die alte Datei noch im Formular, startet die Plugin-Version nicht zusätzlich und meldet in der Browser-Konsole, dass das alte Skript entfernt werden muss.

## Formularaufbau (unverändert)

| CSS-Klasse | Feld | Pflicht |
|---|---|---|
| `openplz-suche` | Suchfeld (Straße + Hausnummer) | ja |
| `openplz-postalcode` | PLZ | ja |
| `openplz-locality` | Ort | ja |
| `openplz-street` | Straße (separat) | nein |

### Ortsbeschränkung

Die Klasse der Beschränkung (z. B. `openplz-kempten`) an das Suchfeld **oder** an einen umgebenden Container hängen. Dann

- liefert die Suche nur Adressen mit erlaubter PLZ (zusätzlich serverseitig gefiltert),
- wird bei Suchen ohne PLZ/Ort der Suchzusatz (z. B. „Kempten“) angehängt,
- wird eine manuell eingetragene fremde PLZ als Fehler markiert.

## Plugin-Einstellungen

| Einstellung | Standard | Bedeutung |
|---|---|---|
| `de.hybridadresssuche.fc.bayernApiKey` | – | API-Key Ortssuchdienst Bayern (maskiert, bleibt auf dem Server) |
| `de.hybridadresssuche.fc.restrictions` | `openplz-kempten=Kempten (Allgäu)\|Kempten\|87435,87437,87439` | Ortsbeschränkungen: `css-klasse=Name\|Suchzusatz\|PLZ,PLZ`, mehrere mit `;` trennen, `-` = keine |
| `de.hybridadresssuche.fc.rateLimitPerMinute` | `120` | Suchanfragen pro Minute und Besucher (10–10000) |
| `de.hybridadresssuche.fc.globalRateLimitPerMinute` | `3000` | Suchanfragen pro Minute für alle Besucher zusammen (100–100000), schützt das Kontingent des API-Keys |
| `de.hybridadresssuche.fc.debug` | `false` | Ausführliche Ausgaben in der Browser-Konsole |

Nach Änderungen das Plugin deaktivieren und wieder aktivieren, damit die Werte übernommen werden.

## Aufbau des Plugins

| Klasse | Typ | Aufgabe |
|---|---|---|
| `AdresssucheServletPlugin` | `IPluginServletAction` (`plugin?name=hybridAdresssuche`) | Proxy zum Ortssuchdienst: Eingabeprüfung, Anfragelimit pro Besucher und global, Cache (10 min), Ortsfilter, Antwort nur `{label}` |
| `AdresssucheResourcePlugin` | `IPluginFormResource` | Formular-Ressource `hybrid-address-search.js` (ES5, ohne Key) |
| `AdresssuchePreRenderPlugin` | `IPluginFormPreRender` | Servlet-URL (inkl. `client-id`), Ortsbeschränkungen, Debug-Schalter für den Browser |
| `AdresssucheBundleProperties` | `IBundleProperties` | Plugin-Einstellungen |

Servlet-Antwort:

```json
{"ok": true, "results": [{"label": "Rathausplatz 29 87435 Kempten (Allgäu)"}]}
```

Fehler: `400 invalid_query | unknown_restriction`, `429 rate_limited`, `502 upstream_error`, `503 not_configured`.

OpenPLZ (Straßenverzeichnisse) wird wie bisher direkt aus dem Browser abgefragt; dafür ist kein Key nötig.

## Entwicklung

```bash
mvn clean package      # Tests + Fat-JAR in target/
mvn -Dxfc.version=8.5.0 clean test   # gegen die Mindestversion prüfen
```

Java 11 (Release-Level), formcycle-APIs als `provided`. Details für die Weiterentwicklung: [CLAUDE.md](CLAUDE.md).

## Sicherheit

Sicherheitstests (Unit-Tests `AdresssucheSecurityTest` und Live-Tests gegen eine formcycle-Installation): [docs/SECURITY_REPORT.md](docs/SECURITY_REPORT.md).

## Änderungen

- **1.0.1:** Neutrale technische Namen (Servlet `hybridAdresssuche`, Ressource `hybridAdresssucheResource`, Einstellungen `de.hybridadresssuche.fc.*`). Beim Wechsel von 1.0.0 den API-Key neu eintragen und die Ressource `hybrid-address-search.js` in den Formularen neu auswählen. Globale Obergrenze für Suchanfragen (Schutz des API-Kontingents, auch bei ständig neuen Sessions), Sicherheitstests.
- **1.0.0:** Erste Plugin-Version, API-Key nur noch serverseitig; Nachfolger von hybrid-address-search.js V12.

## Datenschutz

Suchbegriffe gehen über den formcycle-Server an den Ortssuchdienst Bayern (Landesamt für Digitalisierung, Breitband und Vermessung); die IP-Adresse der Besucher wird dabei nicht weitergegeben. Straßenlisten lädt der Browser direkt von openplzapi.org. Suchbegriffe werden vom Plugin nicht protokolliert.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
