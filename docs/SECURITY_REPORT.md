# Sicherheitsbericht – Hybride Adresssuche (fc-plugin-adresssuche)

- **Stand:** 29.10.2026
- **Geprüfte Versionen:** 1.0.0 (live), 1.0.1 (Unit-Tests)
- **Testumgebung live:** formcycle-Cloud-Testinstallation (Formular mit Suchfeld und Ortsbeschränkung `openplz-kempten`) sowie eine Installation mit Frontend-Server

## Ausgangslage

Das bisherige Skript `hybrid-address-search.js` (V12) rief den Ortssuchdienst Bayern direkt aus dem Browser auf. Der API-Key stand im Quelltext und war damit für jeden Besucher der Formularseite lesbar. Er konnte kopiert und auf fremde Rechnung bzw. zulasten des Kontingents genutzt werden.

Außerdem fügte V12 die Treffer der externen Dienste als HTML-String in die Seite ein, was eine XSS-Lücke über manipulierte API-Antworten ermöglichte.

## Maßnahmen im Plugin

| Bereich | Umsetzung |
|---|---|
| Geheimhaltung des Keys | Key nur in der maskierten Plugin-Einstellung; Abfrage über das Servlet `hybridAdresssuche`; weder Formular-Ressource noch PreRender-Daten enthalten den Key |
| Eingabeprüfung | Suchbegriff 3–120 Zeichen, nur Buchstaben, Ziffern, Leerzeichen und `. , - / ' ( ) & +`; kodiert als ein Pfadsegment |
| Kein offener Proxy (SSRF) | Ziel fest `https://geoservices.bayern.de/services/ortssuche/v1/adressen/`, keine Weiterleitungen, kein Parameter für Host/URL |
| Antwortreduktion | Nur `label` als reiner Text (HTML entfernt), höchstens 50 Treffer, Upstream-Antwort max. 1 MB, Timeout 5 s |
| Missbrauchsschutz | Anfragelimit pro Besucher (Standard 120/min) und global (Standard 3000/min, ab 1.0.1); Cache 10 min |
| Fehlerantworten | Feste Codes (`invalid_query`, `unknown_restriction`, `rate_limited`, `upstream_error`, `not_configured`), kein Echo der Eingabe, keine Exception-Details |
| Logging | Keine Suchbegriffe (personenbezogen), keine URLs mit Key |
| Browser | Trefferliste per `.text()` (behebt die XSS-Lücke aus V12) |
| Mandantentrennung | Einstellungen als Instanzfelder je Plugin-Installation, kein statischer Speicher |
| Header | `Content-Type: application/json`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` |

## Unit-Tests (`AdresssucheSecurityTest`, 12/12 bestanden)

| ID | Prüfung | Ergebnis |
|---|---|---|
| SEC-01 | API-Key in keiner Servlet-Antwort (Erfolg, Fehler) und keinem Header | bestanden |
| SEC-02 | API-Key weder in PreRender-Daten noch in der Formular-Ressource | bestanden |
| SEC-03 | Parameter-Injection in die Upstream-URL (`? & # = %`) wird abgewiesen, kein Upstream-Aufruf | bestanden |
| SEC-04 | `../../admin/x` bleibt ein Segment unter `/adressen/` auf geoservices.bayern.de | bestanden |
| SEC-05 | NUL, CRLF, HTML, Bidi-Steuerzeichen, Überlänge werden abgewiesen | bestanden |
| SEC-06 | `url`/`host`-Parameter werden ignoriert (kein SSRF) | bestanden |
| SEC-07 | Fehlerantworten ohne Echo der Eingabe (keine Reflected XSS) | bestanden |
| SEC-08 | Sicherheits-Header gesetzt | bestanden |
| SEC-09 | Globale Obergrenze greift bei ständig neuen Sessions (100 von 130 erlaubt) | bestanden |
| SEC-10 | Ortsbeschränkung wird serverseitig durchgesetzt | bestanden |
| SEC-11 | Ortsbeschränkungen mit HTML/Script aus der Plugin-Verwaltung werden verworfen | bestanden |
| SEC-12 | Kein statischer Key-Speicher | bestanden |

Zusätzlich 21 Funktionstests in `AdresssuchePluginTest`. Alle 33 Tests laufen gegen formcycle 8.5.5 und 8.5.0.

## Live-Tests (Version 1.0.0, Testinstallation)

Die Live-Tests liefen mit identischem Code vor der Umbenennung der technischen Namen (Servlet, Ressource, Einstellungen) in 1.0.1. Die Pfade sind hier mit den aktuellen Namen angegeben.

### Funktion

| Prüfung | Ergebnis |
|---|---|
| Plugin-Version und PreRender-Daten im Formular (`client-id` 852, Kempten-Beschränkung erkannt) | ok |
| Suche „Rathausplatz 29“ → Anfrage an `/plugin?name=hybridAdresssuche&…&restriction=openplz-kempten`, Treffer „Rathausplatz 29 87435 Kempten (Allgäu)“ | ok |
| Übernahme in Suchfeld/PLZ/Ort, PLZ und Ort gesperrt | ok |
| Fremde PLZ 80331 im PLZ-Feld → Hinweis „Es sind nur Adressen in Kempten (Allgäu) möglich …“ | ok |
| Nur PLZ 87437 → Straßenliste von OpenPLZ | ok |

### Sicherheit (direkte Aufrufe des Servlets)

| Prüfung | Erwartung | Ergebnis |
|---|---|---|
| Key im HTML der Formularseite | nicht enthalten | nicht enthalten |
| Key / `api_key` in der Formular-Ressource | nicht enthalten | nicht enthalten |
| Key in Antworten und Headern aller folgenden Aufrufe | nicht enthalten | nicht enthalten |
| Normale Suche | 200, nur `label` | 200 |
| `q` zu kurz / fehlt / > 120 Zeichen | 400 | 400 |
| `q=Rathaus?api_key=x&srid=1` (Parameter-Injection) | 400 | 400 |
| `q` mit CRLF | 400 | 400 |
| `q=<script>…` | 400 | 400 |
| `q=../../admin` | bleibt beim Ortssuchdienst | 502 `upstream_error` (Ortssuchdienst lehnt ab, kein anderes Ziel erreichbar) |
| `restriction=<img>` | 400 ohne Echo | 400 `unknown_restriction` |
| `q=Marienplatz 1 München&restriction=openplz-kempten` | keine Treffer | 200, leere Liste |
| Zusätzliche `url=`/`host=`-Parameter | ignoriert | ignoriert |
| POST statt GET | gleiche Prüfung | 200, gleiche Prüfung |
| Ohne `client-id` | 404 durch formcycle | 404 |
| Header | JSON, nosniff, no-store | vorhanden |
| 130 Anfragen/min aus einer Session | ab Anfrage 121 → 429 | 120 × 200, danach 429 |
| Weitere Session/Client ohne Cookie von derselben IP direkt danach | 429 (gleicher IP-Bucket) | 429 |
| Browser mit Formular-Session parallel dazu | eigenes Kontingent | 200 |

## Befunde

| Nr. | Befund | Bewertung | Status |
|---|---|---|---|
| B1 | Das Limit pro Besucher hängt an der Session. Wer die Formularseite immer wieder neu lädt, bekommt neue Sessions und damit neue Kontingente. | Mittel (Kontingent des Keys) | **behoben in 1.0.1:** globale Obergrenze (Standard 3000/min) |
| B2 | Clients ohne Session-Cookie teilen sich ein Kontingent pro IP. Hinter einem Reverse-Proxy ohne RemoteIpValve ist das die Proxy-IP. | Niedrig (betrifft nur cookielose Clients, echte Besucher haben eine Session) | dokumentiert |
| B3 | `q=../../admin` wird an den Ortssuchdienst weitergereicht (als ein kodiertes Segment). | Info: kein anderes Ziel erreichbar | akzeptiert |
| B4 | Der in V12 verwendete Key war öffentlich abrufbar. | Hoch | **Maßnahme beim Betreiber:** Key beim LDBV sperren und neu ausstellen lassen, nur im Plugin hinterlegen |

## Empfehlungen für den Betrieb

1. Version 1.0.1 einspielen (globale Obergrenze).
2. Den alten Key sperren und neu ausstellen lassen (B4).
3. In allen Formularen das alte Skript entfernen. Die Plugin-Version warnt in der Browser-Konsole, wenn es noch eingebunden ist.
4. Limits bei Bedarf in den Plugin-Einstellungen an das Kontingent beim LDBV anpassen.
